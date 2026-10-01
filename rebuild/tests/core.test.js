import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { claimRun, checkpointStep, getRun, getSteps } from "../src/store.js";
import { executeClaim } from "../src/worker.js";

test("a real workflow runs through immutable definition, inline checkpoints, and a durable provider receipt", async () => {
  const instance = createApp();
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  async function request(path, method = "GET", body) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        "X-Relay-Request": "1",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal((await request("/workflows")).status, 401);
    assert.equal((await request("/session", "POST", {})).status, 200);
    let workflow = (await request("/workflows", "POST", { name: "Core proof" }))
      .data.workflow;
    workflow = (
      await request(`/workflows/${workflow.id}`, "PATCH", {
        version: workflow.version,
        draftSteps: [
          { type: "transform", name: "Prepare", prefix: "Hello " },
          { type: "notify", name: "Deliver", prefix: "Inbox: " },
        ],
      })
    ).data.workflow;
    workflow = (
      await request(`/workflows/${workflow.id}/publish`, "POST", {
        version: workflow.version,
      })
    ).data.workflow;
    const run = (
      await request(`/workflows/${workflow.id}/runs`, "POST", {
        input: { text: "Relay" },
        idempotencyKey: "core-run",
      })
    ).data.run;
    const claim = claimRun(instance.db, "core-worker", { leaseMs: 1000 });
    assert.equal(claim.id, run.id);
    assert.equal(
      (await executeClaim(instance, claim, { leaseMs: 1000 })).status,
      "succeeded",
    );
    assert.deepEqual(getRun(instance.db, run.id).output, {
      text: "Inbox: Hello Relay",
    });
    assert.equal(getSteps(instance.db, run.id).length, 2);
    assert.equal((await request("/provider/receipts")).data.receipts.length, 1);
    assert.equal(
      (
        await request(`/workflows/${workflow.id}/runs`, "POST", {
          input: { text: "Relay" },
          idempotencyKey: "core-run",
        })
      ).status,
      200,
    );
    assert.throws(
      () =>
        instance.db
          .prepare("UPDATE workflow_versions SET steps=? WHERE workflow_id=?")
          .run("[]", workflow.id),
      /immutable/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    instance.close();
  }
});

test("expired and reclaimed fencing tokens cannot checkpoint", async () => {
  const instance = createApp();
  try {
    const stamp = new Date(0).toISOString();
    instance.db
      .prepare(
        "INSERT INTO runs(workflow_id,workflow_version,workflow_name,status,input,request_key,request_intent,created_at,updated_at) VALUES(1,1,'Welcome aboard','queued',?, 'fence','{}',?,?)",
      )
      .run('{"text":"x"}', stamp, stamp);
    const first = claimRun(instance.db, "one", { now: 1000, leaseMs: 100 });
    assert.equal(
      checkpointStep(instance.db, first.id, first.leaseToken, {
        index: 0,
        output: { text: "x" },
        now: 1100,
      }),
      false,
    );
    const second = claimRun(instance.db, "two", { now: 1100, leaseMs: 100 });
    assert.notEqual(first.leaseToken, second.leaseToken);
    assert.equal(
      checkpointStep(instance.db, first.id, first.leaseToken, {
        index: 0,
        output: { text: "bad" },
        now: 1101,
      }),
      false,
    );
    assert.equal(
      checkpointStep(instance.db, second.id, second.leaseToken, {
        index: 0,
        output: { text: "good" },
        now: 1101,
      }),
      true,
    );
  } finally {
    instance.close();
  }
});
