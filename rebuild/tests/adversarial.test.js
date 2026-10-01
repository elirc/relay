import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { createStore, claimRun, checkpointStep } from "../src/store.js";
import { executeClaim } from "../src/worker.js";

async function fixture(options = {}) {
  const { app, db, providerDb, close } = createApp(options);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    db,
    providerDb,
    base: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      close();
    },
  };
}

async function request(base, method, path, body, cookie, extraHeaders = {}) {
  const headers = { ...extraHeaders };
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
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /httponly/i);
  assert.match(cookie, /samesite=strict/i);
  return cookie.split(";")[0];
}

async function workflow(base, cookie, name, steps) {
  const created = await request(
    base,
    "POST",
    "/api/workflows",
    { name },
    cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.workflow.id;
  const edited = await request(
    base,
    "PATCH",
    `/api/workflows/${id}`,
    {
      version: created.data.workflow.version,
      draftSteps: steps,
    },
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

test("published versions are pinned and run creation is idempotent across draft edits", async () => {
  const fx = await fixture();
  try {
    const cookie = await login(fx.base);
    const first = await workflow(fx.base, cookie, "Pinned version", [
      { type: "transform", name: "prefix one", prefix: "v1:" },
      { type: "notify", name: "send", prefix: "notice:" },
    ]);
    const runRequest = {
      input: { text: "hello" },
      idempotencyKey: "pinned-run",
    };
    const created = await request(
      fx.base,
      "POST",
      `/api/workflows/${first.id}/runs`,
      runRequest,
      cookie,
    );
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const runId = created.data.run.id;
    const originalVersion = created.data.run.workflowVersion;
    const replay = await request(
      fx.base,
      "POST",
      `/api/workflows/${first.id}/runs`,
      runRequest,
      cookie,
    );
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.run.id, runId);
    assert.equal(
      (
        await request(
          fx.base,
          "POST",
          `/api/workflows/${first.id}/runs`,
          {
            input: { text: "changed" },
            idempotencyKey: "pinned-run",
          },
          cookie,
        )
      ).status,
      409,
    );
    const nextDraft = await request(
      fx.base,
      "PATCH",
      `/api/workflows/${first.id}`,
      {
        version: first.version,
        draftSteps: [{ type: "transform", name: "prefix two", prefix: "v2:" }],
      },
      cookie,
    );
    assert.equal(nextDraft.status, 200, JSON.stringify(nextDraft.data));
    const stale = await request(
      fx.base,
      "PATCH",
      `/api/workflows/${first.id}`,
      {
        version: first.version,
        name: "Stale overwrite",
      },
      cookie,
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.data));
    assert.ok(stale.data.current);
    const published = await request(
      fx.base,
      "POST",
      `/api/workflows/${first.id}/publish`,
      {
        version: nextDraft.data.workflow.version,
      },
      cookie,
    );
    assert.equal(published.status, 200);
    const oldKeyAfterPublish = await request(
      fx.base,
      "POST",
      `/api/workflows/${first.id}/runs`,
      runRequest,
      cookie,
    );
    assert.equal(oldKeyAfterPublish.status, 200);
    assert.equal(oldKeyAfterPublish.data.run.id, runId);
    const existing = await request(
      fx.base,
      "GET",
      `/api/runs/${runId}`,
      undefined,
      cookie,
    );
    assert.equal(existing.status, 200);
    assert.equal(existing.data.run.workflowVersion, originalVersion);
    const newer = await request(
      fx.base,
      "POST",
      `/api/workflows/${first.id}/runs`,
      {
        input: { text: "hello" },
        idempotencyKey: "new-version-run",
      },
      cookie,
    );
    assert.equal(newer.status, 201);
    assert.notEqual(newer.data.run.workflowVersion, originalVersion);
    const definition = await request(
      fx.base,
      "GET",
      `/api/workflows/${first.id}`,
      undefined,
      cookie,
    );
    assert.equal(definition.status, 200);
    assert.ok(definition.data.versions.length >= 2);
    const oldClaim = claimRun(fx.db, "version-test", { leaseMs: 3000 });
    assert.equal(oldClaim.id, runId);
    assert.equal((await executeClaim(fx, oldClaim)).status, "succeeded");
    const newClaim = claimRun(fx.db, "version-test", { leaseMs: 3000 });
    assert.equal(newClaim.id, newer.data.run.id);
    assert.equal((await executeClaim(fx, newClaim)).status, "succeeded");
    const oldResult = await request(
      fx.base,
      "GET",
      `/api/runs/${runId}`,
      undefined,
      cookie,
    );
    const newResult = await request(
      fx.base,
      "GET",
      `/api/runs/${newer.data.run.id}`,
      undefined,
      cookie,
    );
    assert.equal(oldResult.data.run.output.text, "notice:v1:hello");
    assert.equal(newResult.data.run.output.text, "v2:hello");
  } finally {
    await fx.stop();
  }
});

test("aged server-side session is rejected even if the cookie is replayed", async () => {
  const fx = await fixture();
  try {
    const cookie = await login(fx.base);
    fx.db
      .prepare("UPDATE sessions SET created_at=?")
      .run("2000-01-01T00:00:00.000Z");
    assert.equal(
      (await request(fx.base, "GET", "/api/session", undefined, cookie)).status,
      401,
    );
  } finally {
    await fx.stop();
  }
});

test("invalid declarative steps and inputs fail without changing workflow version", async () => {
  const fx = await fixture();
  try {
    const cookie = await login(fx.base);
    const made = await request(
      fx.base,
      "POST",
      "/api/workflows",
      { name: "Validation" },
      cookie,
    );
    assert.equal(made.status, 201);
    const { id, version } = made.data.workflow;
    for (const draftSteps of [
      [{ type: "notify", name: "bad", url: "https://example.invalid" }],
      [{ type: "wait", name: "too long", ms: 30001 }],
      [{ type: "transform", name: "bad\u0000name" }],
      Array.from({ length: 11 }, (_, index) => ({
        type: "transform",
        name: `step ${index}`,
      })),
    ]) {
      const rejected = await request(
        fx.base,
        "PATCH",
        `/api/workflows/${id}`,
        { version, draftSteps },
        cookie,
      );
      assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
    }
    const unchanged = await request(
      fx.base,
      "GET",
      `/api/workflows/${id}`,
      undefined,
      cookie,
    );
    assert.equal(unchanged.data.workflow.version, version);
    assert.equal(
      (
        await request(
          fx.base,
          "POST",
          `/api/workflows/${id}/publish`,
          { version },
          cookie,
        )
      ).status,
      400,
      "an empty workflow draft cannot be published",
    );
    assert.equal(
      (
        await request(
          fx.base,
          "GET",
          "/api/runs/%5Bobject%20Object%5D",
          undefined,
          cookie,
        )
      ).status,
      400,
    );
  } finally {
    await fx.stop();
  }
});

test("an expired or replaced worker lease cannot checkpoint the step", async () => {
  const dir = await mkdtemp(join(tmpdir(), "relay-fence-"));
  const dbPath = join(dir, "app.sqlite");
  const providerDbPath = join(dir, "provider.sqlite");
  let fx;
  let store;
  try {
    fx = await fixture({ dbPath, providerDbPath });
    const cookie = await login(fx.base);
    const flow = await workflow(fx.base, cookie, "Fence test", [
      { type: "transform", name: "first", prefix: "ok:" },
    ]);
    const made = await request(
      fx.base,
      "POST",
      `/api/workflows/${flow.id}/runs`,
      {
        input: { text: "x" },
        idempotencyKey: "fence-run",
      },
      cookie,
    );
    assert.equal(made.status, 201);
    store = createStore({ dbPath, providerDbPath });
    const now = Date.now() + 100;
    const first = claimRun(store.db, "worker-a", { leaseMs: 1000, now });
    assert.equal(first.id, made.data.run.id);
    const second = claimRun(store.db, "worker-b", {
      leaseMs: 1000,
      now: now + 1001,
    });
    assert.equal(second.id, first.id);
    assert.notEqual(second.leaseToken, first.leaseToken);
    assert.equal(
      checkpointStep(store.db, first.id, first.leaseToken, {
        index: 0,
        output: { text: "stale" },
        now: now + 1002,
      }),
      false,
    );
    assert.equal(
      checkpointStep(store.db, second.id, second.leaseToken, {
        index: 0,
        output: { text: "ok:x" },
        now: now + 1002,
      }),
      true,
    );
    const detail = await request(
      fx.base,
      "GET",
      `/api/runs/${first.id}`,
      undefined,
      cookie,
    );
    assert.equal(detail.status, 200);
    assert.doesNotMatch(JSON.stringify(detail.data.steps), /stale/);
  } finally {
    if (store) store.close();
    if (fx) await fx.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
