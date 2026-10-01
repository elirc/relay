import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { runWorker, executeClaim } from "../src/worker.js";
import { claimRun } from "../src/store.js";

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  output = join(root, "test-results");
await mkdir(output, { recursive: true });
const instance = createApp(),
  server = instance.app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, page, controller, worker;
function startWorker() {
  controller = new AbortController();
  worker = runWorker({
    store: instance,
    signal: controller.signal,
    pollMs: 30,
  });
}
async function stopWorker() {
  controller?.abort();
  await worker;
}
const results = [],
  errors = [];
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
async function nav(view) {
  await page.locator(`.sidebar [data-view="${view}"]`).click();
  await page.locator("#content h1").waitFor();
}
async function openEditor(id) {
  await nav("workflows");
  await page.locator(`#content [data-workflow="${id}"]`).click();
  await page.locator("#workflow-name").waitFor();
}
async function runState(status) {
  await page
    .locator(`.run-heading-meta .status-badge.${status}`)
    .waitFor({ timeout: 20000 });
}
async function submitRun(id, input) {
  await page.locator(`[data-run-workflow="${id}"]`).click();
  await page.locator("#run-input").fill(input);
  await page.locator('#run-form [type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector("#run-dialog").open);
}
try {
  startWorker();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  let workflowId;
  await check("login, real worker status and desktop overview", async () => {
    await page.goto(base);
    await page.locator('[data-action="login"]').click();
    await page.locator(".workflow-card").first().waitFor();
    assert.equal(await page.locator(".workflow-card").count(), 2);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal((await api("/summary")).data.worker.online, true);
    await page.screenshot({
      path: join(output, "desktop-studio.png"),
      fullPage: true,
    });
  });
  await check(
    "create workflow and compose transform, wait and notify steps",
    async () => {
      await page.locator('#content [data-action="create-workflow"]').click();
      await page.locator("#create-name").fill("Review delivery");
      await page
        .locator("#create-description")
        .fill("A real sequence with durable output.");
      await page.locator('#create-form [type="submit"]').click();
      await page.locator("#workflow-name").waitFor();
      workflowId = (await api("/workflows")).data.workflows.find(
        (w) => w.name === "Review delivery",
      ).id;
      await page.locator('[data-action="add-step"]').click();
      await page.locator("#step-name-0").fill("Compose review");
      await page.locator("#step-prefix-0").fill("Reviewed: ");
      await page.locator('[data-action="add-step"]').click();
      await page.locator("#step-type-1").selectOption("wait");
      await page.locator("#step-name-1").fill("A brief pause");
      await page.locator("#step-ms-1").fill("25");
      await page.locator('[data-action="add-step"]').click();
      await page.locator("#step-type-2").selectOption("notify");
      await page.locator("#step-name-2").fill("Deliver review");
      await page.locator("#step-prefix-2").fill("Team: ");
      assert.equal(await page.locator(".step-editor").count(), 3);
    },
  );
  await check(
    "reordering preserves blank numeric input and cannot publish it as zero",
    async () => {
      await page.locator("#step-ms-1").fill("");
      await page.locator('[data-step-down="1"]').click();
      assert.equal(await page.locator("#step-ms-2").inputValue(), "");
      await page.locator('[data-action="publish"]').click();
      assert.equal(
        (await api(`/workflows/${workflowId}`)).data.versions.length,
        0,
      );
      await page.locator("#step-ms-2").fill("25");
      await page.locator('[data-step-up="2"]').click();
      assert.equal(
        await page.locator("#step-prefix-0").inputValue(),
        "Reviewed: ",
      );
      assert.equal(await page.locator("#step-prefix-2").inputValue(), "Team: ");
      await page.locator('[data-action="publish"]').click();
      await page.waitForFunction(() =>
        document
          .querySelector(".page-heading .eyebrow")
          ?.textContent.includes("Published v1"),
      );
      const definition = (await api(`/workflows/${workflowId}`)).data
        .versions[0];
      assert.deepEqual(
        definition.steps.map((s) => s.type),
        ["transform", "wait", "notify"],
      );
      await page.screenshot({
        path: join(output, "workflow-editor.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "run completes through worker checkpoints and durable provider inbox",
    async () => {
      await submitRun(workflowId, "Architecture choices");
      await runState("succeeded");
      assert.equal(await page.locator(".timeline-marker.complete").count(), 3);
      assert.match(
        await page.locator(".input-output").textContent(),
        /Team: Reviewed: Architecture choices/,
      );
      await page.screenshot({
        path: join(output, "completed-timeline.png"),
        fullPage: true,
      });
      await nav("receipts");
      await page.locator(".receipt").waitFor();
      assert.match(
        await page.locator(".receipt p").textContent(),
        /Team: Reviewed: Architecture choices/,
      );
    },
  );
  await check(
    "stale draft conflict preserves fields until explicit latest-version load",
    async () => {
      await openEditor(workflowId);
      const saved = (await api(`/workflows/${workflowId}`)).data.workflow;
      await page.locator("#workflow-name").fill("My unsaved draft");
      assert.equal(
        (
          await api(
            `/workflows/${workflowId}`,
            { version: saved.version, name: "Another editor saved this" },
            "PATCH",
          )
        ).status,
        200,
      );
      await page.locator('[data-action="save-draft"]').click();
      await page.locator(".conflict").waitFor();
      assert.equal(
        await page.locator("#workflow-name").inputValue(),
        "My unsaved draft",
      );
      assert.equal(
        await page.locator('[data-action="publish"]').isDisabled(),
        true,
      );
      await page.locator('[data-action="reload-draft"]').click();
      await page.waitForFunction(
        () =>
          document.querySelector("#workflow-name")?.value ===
          "Another editor saved this",
      );
    },
  );
  await check(
    "expired session can reconnect while preserving the unsaved draft",
    async () => {
      await page
        .locator("#workflow-name")
        .fill("Preserved across session expiry");
      instance.db
        .prepare("UPDATE sessions SET created_at=?")
        .run("2000-01-01T00:00:00.000Z");
      await page.locator('[data-action="save-draft"]').click();
      await page.locator("#session-dialog").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#workflow-name").inputValue(),
        "Preserved across session expiry",
      );
      await page.locator('[data-action="reauth"]').click();
      await page.waitForFunction(
        () => !document.querySelector("#session-dialog").open,
      );
      assert.equal(
        (await api(`/workflows/${workflowId}`)).data.workflow.name,
        "Another editor saved this",
        "reconnect must not retry a write silently",
      );
      await page.locator('[data-action="save-draft"]').click();
      await page.waitForFunction(() =>
        document.querySelector("#draft-status")?.textContent.includes("Saved"),
      );
      assert.equal(
        (await api(`/workflows/${workflowId}`)).data.workflow.name,
        "Preserved across session expiry",
      );
    },
  );
  await check(
    "lost run response retries the same key and creates only one run",
    async () => {
      const before = (await api("/runs")).data.runs.length;
      let first = true;
      const handler = async (route) => {
        if (!first) return route.continue();
        first = false;
        await route.fetch();
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Injected response loss after commit",
          }),
        });
      };
      await page.route(`**/api/workflows/${workflowId}/runs`, handler);
      try {
        await page.locator(`[data-run-workflow="${workflowId}"]`).click();
        await page.locator("#run-input").fill("One intended run");
        await page.locator('#run-form [type="submit"]').click();
        await page.getByText(/Injected response loss/).waitFor();
        assert.equal((await api("/runs")).data.runs.length, before + 1);
        await page.locator('#run-form [type="submit"]').click();
        await runState("succeeded");
        assert.equal((await api("/runs")).data.runs.length, before + 1);
      } finally {
        await page.unroute(`**/api/workflows/${workflowId}/runs`, handler);
      }
    },
  );
  await check(
    "cancel a waiting run and prevent its notification step",
    async () => {
      const created = (
        await api("/workflows", { name: "Cancellation exercise" })
      ).data.workflow;
      const edited = (
        await api(
          `/workflows/${created.id}`,
          {
            version: created.version,
            draftSteps: [
              { type: "wait", name: "Await cancellation", ms: 10000 },
              { type: "notify", name: "Must not send", prefix: "Cancelled: " },
            ],
          },
          "PATCH",
        )
      ).data.workflow;
      await api(`/workflows/${created.id}/publish`, {
        version: edited.version,
      });
      const receipts = (await api("/provider/receipts")).data.receipts.length;
      await openEditor(created.id);
      await submitRun(created.id, "No notification");
      await runState("running");
      await page.locator('[data-action="cancel-run"]').click();
      await runState("cancelled");
      assert.equal(await page.locator('[data-action="retry-run"]').count(), 0);
      assert.equal(
        (await api("/provider/receipts")).data.receipts.length,
        receipts,
      );
    },
  );
  await check(
    "visible failed run can be retried after a real injected provider failure",
    async () => {
      await stopWorker();
      await openEditor(workflowId);
      await submitRun(workflowId, "Recover this failure");
      const claim = claimRun(instance.db, "browser-failure-proof");
      assert.ok(claim);
      await executeClaim(instance, claim, {
        transientFailures: 100,
        maxAttempts: 1,
      });
      await runState("failed");
      assert.match(
        await page.locator("#content").textContent(),
        /Simulated transient provider unavailability/,
      );
      startWorker();
      await page.locator('[data-action="retry-run"]').click();
      await runState("succeeded");
      assert.match(
        await page.locator(".audit").textContent(),
        /Operator retried/,
      );
    },
  );
  await check(
    "mobile studio, search and reload use persisted workflow state",
    async () => {
      await nav("workflows");
      await page.locator("#workflow-search").fill("Preserved across");
      assert.equal(await page.locator(".workflow-card").count(), 1);
      await page.reload();
      await page.locator(".workflow-card").first().waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: join(output, "mobile-studio.png"),
        fullPage: true,
      });
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    `${results.length}/${results.length} Relay browser scenarios passed.`,
  );
} catch (e) {
  await page
    ?.screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, "browser-results.json"),
    JSON.stringify(
      { timestamp: new Date().toISOString(), results, runtimeErrors: errors },
      null,
      2,
    ),
  );
  await browser?.close();
  await stopWorker();
  await new Promise((r) => server.close(r));
  instance.close();
}
