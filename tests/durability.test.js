import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function processReady(
  command,
  dbPath,
  providerDbPath,
  extraEnv = {},
  pattern,
) {
  const child = spawn(process.execPath, [command], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PROVIDER_DB_PATH: providerDbPath,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const matched = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Process readiness timed out: ${stdout}\n${stderr}`)),
      15000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Process exited ${code}: ${stdout}\n${stderr}`));
    });
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(pattern);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    });
  });
  return {
    child,
    matched,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

async function startWeb(dbPath, providerDbPath) {
  const running = await processReady(
    "src/server.js",
    dbPath,
    providerDbPath,
    { PORT: "0" },
    /Relay ready (http:\/\/127\.0\.0\.1:\d+)/,
  );
  return { ...running, base: running.matched[1] };
}

async function startWorker(dbPath, providerDbPath, extraEnv = {}) {
  return processReady(
    "src/worker.js",
    dbPath,
    providerDbPath,
    { LEASE_MS: "500", POLL_MS: "20", RETRY_DELAY_MS: "20", ...extraEnv },
    /Relay worker ready ([\w-]+)/,
  );
}

async function stop(running) {
  if (!running || running.child.exitCode !== null) return;
  const exit = once(running.child, "exit");
  running.child.kill();
  await exit;
}

async function request(base, method, path, body, cookie) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (method !== "GET") headers["X-Relay-Request"] = "1";
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  return {
    status: response.status,
    data: raw ? JSON.parse(raw) : undefined,
    headers: response.headers,
  };
}

async function login(base) {
  const response = await request(base, "POST", "/api/session", {});
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.headers.get("set-cookie").split(";")[0];
}

async function flow(base, cookie, name, steps) {
  const created = await request(
    base,
    "POST",
    "/api/workflows",
    { name },
    cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { id, version } = created.data.workflow;
  const edited = await request(
    base,
    "PATCH",
    `/api/workflows/${id}`,
    { version, draftSteps: steps },
    cookie,
  );
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const published = await request(
    base,
    "POST",
    `/api/workflows/${id}/publish`,
    {
      version: edited.data.workflow.version,
    },
    cookie,
  );
  assert.equal(published.status, 200, JSON.stringify(published.data));
  return published.data.workflow;
}

async function run(base, cookie, flowId, key, text) {
  const created = await request(
    base,
    "POST",
    `/api/workflows/${flowId}/runs`,
    {
      input: { text },
      idempotencyKey: key,
    },
    cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  return created.data.run;
}

async function eventually(task, predicate, timeoutMs = 10000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const value = await task();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Condition was not reached before timeout.");
}

test(
  "worker crash after durable provider effect resumes one receipt and prior checkpoint",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-crash-"));
    const dbPath = join(dir, "app.sqlite");
    const providerDbPath = join(dir, "provider.sqlite");
    let web;
    let crashing;
    let resumed;
    let reopened;
    try {
      web = await startWeb(dbPath, providerDbPath);
      const cookie = await login(web.base);
      const definition = await flow(web.base, cookie, "Crash recovery", [
        { type: "transform", name: "format", prefix: "ready:" },
        { type: "notify", name: "deliver", prefix: "msg:" },
      ]);
      const created = await run(
        web.base,
        cookie,
        definition.id,
        "crash-effect",
        "payload",
      );
      crashing = await startWorker(dbPath, providerDbPath, {
        CRASH_AFTER_EFFECT_ONCE: "1",
      });
      const [code] = await once(crashing.child, "exit");
      assert.equal(code, 86, `${crashing.stdout}\n${crashing.stderr}`);
      assert.match(crashing.stdout, /provider accepted/);
      const pending = await request(
        web.base,
        "GET",
        `/api/runs/${created.id}`,
        undefined,
        cookie,
      );
      assert.equal(pending.status, 200);
      assert.equal(pending.data.run.status, "running");
      assert.equal(
        pending.data.steps.length,
        1,
        "transform checkpoint precedes the accepted effect",
      );
      const firstCheckpoint = pending.data.steps[0];
      assert.equal(firstCheckpoint.output.text, "ready:payload");
      const before = await request(
        web.base,
        "GET",
        "/api/provider/receipts",
        undefined,
        cookie,
      );
      assert.equal(
        before.data.receipts.filter(
          (receipt) => receipt.key === `${created.id}:1`,
        ).length,
        1,
      );

      resumed = await startWorker(dbPath, providerDbPath);
      const completed = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${created.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "succeeded",
      );
      assert.equal(completed.steps.length, 2);
      assert.equal(
        completed.steps[0].id,
        firstCheckpoint.id,
        "finished steps must not be executed or overwritten on resume",
      );
      assert.equal(completed.steps[1].output.text, "msg:ready:payload");
      assert.equal(
        completed.run.attempt,
        2,
        "the second worker reclaimed the expired lease",
      );
      const after = await request(
        web.base,
        "GET",
        "/api/provider/receipts",
        undefined,
        cookie,
      );
      assert.equal(
        after.data.receipts.filter(
          (receipt) => receipt.key === `${created.id}:1`,
        ).length,
        1,
      );
      assert.ok(completed.events.some((event) => event.kind === "reclaimed"));
      console.info(
        `Relay crash recovery: run ${created.id}, attempts ${completed.run.attempt}, provider receipts 1, checkpoints ${completed.steps.length}`,
      );

      await stop(resumed);
      resumed = undefined;
      await stop(web);
      web = undefined;
      reopened = await startWeb(dbPath, providerDbPath);
      const persisted = await request(
        reopened.base,
        "GET",
        `/api/runs/${created.id}`,
        undefined,
        cookie,
      );
      assert.equal(persisted.status, 200);
      assert.equal(persisted.data.run.status, "succeeded");
      assert.equal(persisted.data.steps[0].id, firstCheckpoint.id);
      assert.equal(
        (
          await request(
            reopened.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        1,
      );
    } finally {
      await Promise.all([
        stop(crashing),
        stop(resumed),
        stop(web),
        stop(reopened),
      ]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "two competing workers claim once and cancellation invalidates an active lease",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-workers-"));
    const dbPath = join(dir, "app.sqlite");
    const providerDbPath = join(dir, "provider.sqlite");
    let web;
    let left;
    let right;
    try {
      web = await startWeb(dbPath, providerDbPath);
      const cookie = await login(web.base);
      const definition = await flow(web.base, cookie, "Contended workers", [
        { type: "wait", name: "pause", ms: 400 },
        { type: "notify", name: "send" },
      ]);
      const one = await run(
        web.base,
        cookie,
        definition.id,
        "workers-one",
        "only once",
      );
      [left, right] = await Promise.all([
        startWorker(dbPath, providerDbPath, { LEASE_MS: "3000" }),
        startWorker(dbPath, providerDbPath, { LEASE_MS: "3000" }),
      ]);
      const completed = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${one.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "succeeded",
      );
      assert.equal(
        completed.events.filter((event) => event.kind === "claimed").length,
        1,
      );
      assert.equal(
        completed.events.filter((event) => event.kind === "reclaimed").length,
        0,
      );
      assert.equal(
        (
          await request(
            web.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        1,
      );

      const cancelled = await run(
        web.base,
        cookie,
        definition.id,
        "workers-cancel",
        "never send",
      );
      await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${cancelled.id}`,
              undefined,
              cookie,
            )
          ).data.run,
        (current) => current.status === "running",
      );
      const action = await request(
        web.base,
        "POST",
        `/api/runs/${cancelled.id}/cancel`,
        {},
        cookie,
      );
      assert.equal(action.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 550));
      const current = await request(
        web.base,
        "GET",
        `/api/runs/${cancelled.id}`,
        undefined,
        cookie,
      );
      assert.equal(current.data.run.status, "cancelled");
      assert.equal(current.data.steps.length, 0);
      assert.equal(
        (
          await request(
            web.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        1,
      );
    } finally {
      await Promise.all([stop(left), stop(right), stop(web)]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "transient retries terminate at limit, and manual retry can recover a failed run",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-retry-"));
    const dbPath = join(dir, "app.sqlite");
    const providerDbPath = join(dir, "provider.sqlite");
    let web;
    let failing;
    let recovering;
    try {
      web = await startWeb(dbPath, providerDbPath);
      const cookie = await login(web.base);
      const definition = await flow(web.base, cookie, "Retry bounds", [
        { type: "notify", name: "send" },
      ]);
      const created = await run(
        web.base,
        cookie,
        definition.id,
        "retry-fail",
        "eventual",
      );
      failing = await startWorker(dbPath, providerDbPath, {
        TRANSIENT_FAILURES: "9",
        MAX_ATTEMPTS: "3",
      });
      const failed = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${created.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "failed",
      );
      assert.equal(failed.run.attempt, 3);
      assert.equal(failed.steps.length, 0);
      assert.equal(
        failed.events.filter((event) => event.kind === "retry_scheduled")
          .length,
        2,
      );
      assert.equal(
        (
          await request(
            web.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        0,
      );
      await stop(failing);
      failing = undefined;
      assert.equal(
        (
          await request(
            web.base,
            "POST",
            `/api/runs/${created.id}/retry`,
            {},
            cookie,
          )
        ).status,
        200,
      );
      recovering = await startWorker(dbPath, providerDbPath);
      const recovered = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${created.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "succeeded",
      );
      assert.equal(recovered.run.attempt, 4);
      assert.equal(recovered.steps.length, 1);
      assert.equal(
        (
          await request(
            web.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        1,
      );
    } finally {
      await Promise.all([stop(failing), stop(recovering), stop(web)]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "large bounded output survives restart while oversized output fails before checkpoint",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-output-"));
    const dbPath = join(dir, "app.sqlite");
    const providerDbPath = join(dir, "provider.sqlite");
    let web;
    let worker;
    let reopened;
    try {
      web = await startWeb(dbPath, providerDbPath);
      const cookie = await login(web.base);
      const bounded = await flow(web.base, cookie, "Bounded output", [
        {
          type: "transform",
          name: "large transform",
          prefix: "x".repeat(20_000),
          suffix: "y".repeat(20_000),
        },
      ]);
      const accepted = await run(
        web.base,
        cookie,
        bounded.id,
        "output-accepted",
        "z".repeat(10_000),
      );
      const excessive = await flow(web.base, cookie, "Excess output", [
        {
          type: "transform",
          name: "too large",
          prefix: "😀".repeat(10_000),
          suffix: "😀".repeat(10_000),
        },
      ]);
      const rejected = await run(
        web.base,
        cookie,
        excessive.id,
        "output-rejected",
        "😀".repeat(5_000),
      );
      worker = await startWorker(dbPath, providerDbPath);
      const good = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${accepted.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "succeeded",
      );
      assert.equal(good.steps.length, 1);
      assert.equal(good.steps[0].output.text.length, 50_000);
      const bad = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${rejected.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "failed",
      );
      assert.equal(bad.steps.length, 0);
      assert.match(bad.run.error, /64\s?000|64000|exceeds/i);
      await stop(worker);
      worker = undefined;
      await stop(web);
      web = undefined;
      reopened = await startWeb(dbPath, providerDbPath);
      const persisted = await request(
        reopened.base,
        "GET",
        `/api/runs/${accepted.id}`,
        undefined,
        cookie,
      );
      assert.equal(persisted.status, 200);
      assert.equal(persisted.data.steps[0].output.text.length, 50_000);
    } finally {
      await Promise.all([stop(worker), stop(web), stop(reopened)]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "web and two workers initialize a fresh shared database concurrently",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-fresh-init-"));
    const dbPath = join(dir, "app.sqlite");
    const providerDbPath = join(dir, "provider.sqlite");
    let web;
    let left;
    let right;
    try {
      [web, left, right] = await Promise.all([
        startWeb(dbPath, providerDbPath),
        startWorker(dbPath, providerDbPath),
        startWorker(dbPath, providerDbPath),
      ]);
      const cookie = await login(web.base);
      const seeded = await request(
        web.base,
        "GET",
        "/api/workflows",
        undefined,
        cookie,
      );
      assert.equal(seeded.status, 200);
      assert.ok(seeded.data.workflows.length >= 2);
      const created = await run(
        web.base,
        cookie,
        seeded.data.workflows[0].id,
        "fresh-start-run",
        "Sam",
      );
      const completed = await eventually(
        async () =>
          (
            await request(
              web.base,
              "GET",
              `/api/runs/${created.id}`,
              undefined,
              cookie,
            )
          ).data,
        (data) => data.run.status === "succeeded",
      );
      assert.equal(completed.run.attempt, 1);
      assert.equal(
        (
          await request(
            web.base,
            "GET",
            "/api/provider/receipts",
            undefined,
            cookie,
          )
        ).data.receipts.length,
        1,
      );
    } finally {
      await Promise.all([stop(left), stop(right), stop(web)]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);
