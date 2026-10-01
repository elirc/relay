// Added 2026-10-01 as part of the upskilling expansion, after the original
// verified build. The original build's browser evidence is tests/browser.mjs
// plus journal/evidence; this suite adds delayed-response race coverage: a
// local interception layer forwards real requests but can hold specific
// responses, so stale replies and pending writes race the real UI.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  output = join(root, "test-results");
await mkdir(output, { recursive: true });
const instance = createApp(),
  server = instance.app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const results = [],
  errors = [],
  network = [];
let browser, page;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function check(name, work) {
  try {
    await work();
    results.push({ name, status: "passed" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "failed", error: e.message });
    throw e;
  }
}
// Forwards the first matching request to the real server, then holds its
// finished response until release(); every other request passes through.
async function hold(pattern, method = "GET") {
  const entered = deferred(),
    release = deferred(),
    done = deferred();
  let used = false;
  const handler = async (route) => {
    if (used || route.request().method() !== method) return route.continue();
    used = true;
    const response = await route.fetch();
    entered.resolve();
    await release.promise;
    await route.fulfill({ response });
    done.resolve();
  };
  await page.route(pattern, handler);
  return {
    entered: entered.promise,
    release: async () => {
      release.resolve();
      if (used) await done.promise;
      await page.unroute(pattern, handler);
    },
  };
}
async function settle() {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function api(path, body, method = "POST") {
  return page.evaluate(
    async ({ path, body, method }) => {
      const res = await fetch(
        "/api" + path,
        body === undefined
          ? {}
          : {
              method,
              headers: {
                "Content-Type": "application/json",
                "X-Relay-Request": "1",
              },
              body: JSON.stringify(body),
            },
      );
      return {
        status: res.status,
        data: res.status === 204 ? null : await res.json(),
      };
    },
    { path, body, method },
  );
}
const workflowName = (id) =>
  instance.db.prepare("SELECT name FROM workflows WHERE id=?").get(id).name;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (request) =>
    network.push({
      event: "request",
      method: request.method(),
      path: new URL(request.url()).pathname,
    }),
  );
  page.on("response", (response) =>
    network.push({
      event: "response",
      status: response.status(),
      path: new URL(response.url()).pathname,
    }),
  );
  await page.goto(base);
  await page.locator('[data-action="login"]').click();
  await page.locator(".workflow-card").first().waitFor();
  // Two queued runs against the two seeded published workflows. No worker is
  // started: the runs stay queued, which is all these view races need.
  const runA = (
    await api("/workflows/1/runs", {
      input: { text: "Race run A" },
      idempotencyKey: "ui-race-a",
    })
  ).data.run;
  const runB = (
    await api("/workflows/2/runs", {
      input: { text: "Race run B" },
      idempotencyKey: "ui-race-b",
    })
  ).data.run;

  await check(
    "delayed run detail for run A cannot populate the view after navigating to run B",
    async () => {
      await page.locator('.sidebar [data-view="runs"]').click();
      await page.locator(`[data-run="${runA.id}"]`).waitFor();
      const held = await hold(`**/api/runs/${runA.id}`);
      try {
        await page.locator(`[data-run="${runA.id}"]`).click();
        await held.entered;
        await page.locator('.sidebar [data-view="runs"]').click();
        await page.locator(`[data-run="${runB.id}"]`).click();
        await page.waitForFunction(
          (id) =>
            document.querySelector("#breadcrumb")?.textContent === `Run ${id}`,
          runB.id,
        );
        await held.release();
        await settle();
        assert.equal(
          await page.locator("#breadcrumb").textContent(),
          `Run ${runB.id}`,
        );
        assert.equal(
          await page.locator("#content h1").textContent(),
          workflowName(2),
        );
        assert.match(
          await page.locator(".input-output").textContent(),
          /Race run B/,
        );
      } finally {
        await held.release();
      }
    },
  );

  await check(
    "delayed workflow GET for A cannot overwrite the editor after switching to B",
    async () => {
      await page.locator('.sidebar [data-view="overview"]').click();
      await page.locator(".workflow-card").first().waitFor();
      const held = await hold("**/api/workflows/1");
      try {
        await page.locator('.sidebar [data-workflow="1"]').click();
        await held.entered;
        await page.locator('.sidebar [data-workflow="2"]').click();
        await page.locator("#workflow-name").waitFor();
        assert.equal(
          await page.locator("#workflow-name").inputValue(),
          workflowName(2),
        );
        await page.locator("#workflow-name").fill("Unsaved field in B");
        await held.release();
        await settle();
        assert.equal(
          await page.locator("#workflow-name").inputValue(),
          "Unsaved field in B",
        );
        assert.match(
          await page.locator("#draft-status").textContent(),
          /Unsaved changes/,
        );
      } finally {
        await held.release();
      }
    },
  );

  await check(
    "pending save disables the editor, blocks navigation, and sends no duplicate write",
    async () => {
      // Continues in workflow 2's editor with the unsaved field from above.
      const patches = () =>
        network.filter(
          (entry) =>
            entry.event === "request" &&
            entry.method === "PATCH" &&
            entry.path === "/api/workflows/2",
        ).length;
      const before = patches();
      const held = await hold("**/api/workflows/2", "PATCH");
      try {
        await page.locator('[data-action="save-draft"]').click();
        await held.entered;
        assert.equal(
          await page.locator("#workflow-name").isDisabled(),
          true,
        );
        assert.equal(
          await page.locator('[data-action="publish"]').isDisabled(),
          true,
        );
        // A forced click on the disabled save button must not submit again.
        await page.evaluate(() =>
          document.querySelector('[data-action="save-draft"]').click(),
        );
        // Navigation is guarded while the write is pending.
        await page.locator('.sidebar [data-view="overview"]').click();
        await settle();
        assert.equal(await page.locator("#workflow-name").count(), 1);
        assert.equal(patches(), before + 1);
        await held.release();
        await page.waitForFunction(() =>
          document
            .querySelector("#draft-status")
            ?.textContent.includes("Saved"),
        );
        assert.equal(patches(), before + 1);
        assert.equal(workflowName(2), "Unsaved field in B");
      } finally {
        await held.release();
      }
    },
  );

  await check(
    "session expiry mid-save preserves the draft and never replays the write",
    async () => {
      await page.locator("#workflow-name").fill("Draft survives expiry");
      instance.db
        .prepare("UPDATE sessions SET created_at=?")
        .run("2000-01-01T00:00:00.000Z");
      await page.locator('[data-action="save-draft"]').click();
      await page.locator("#session-dialog").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#workflow-name").inputValue(),
        "Draft survives expiry",
      );
      await page.locator('[data-action="reauth"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#session-dialog").open,
      );
      await settle();
      assert.equal(
        workflowName(2),
        "Unsaved field in B",
        "reconnect must not retry the failed write silently",
      );
      assert.equal(
        await page.locator("#workflow-name").inputValue(),
        "Draft survives expiry",
      );
      await page.locator('[data-action="save-draft"]').click();
      await page.waitForFunction(() =>
        document.querySelector("#draft-status")?.textContent.includes("Saved"),
      );
      assert.equal(workflowName(2), "Draft survives expiry");
    },
  );

  assert.deepEqual(errors, []);
  console.log(
    `${results.length}/${results.length} Relay UI race scenarios passed.`,
  );
} catch (e) {
  await page
    ?.screenshot({ path: join(output, "race-failure.png"), fullPage: true })
    .catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, "ui-race-results.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        results,
        runtimeErrors: errors,
        network,
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
  instance.close();
}
