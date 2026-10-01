import express from "express";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createStore,
  transaction,
  timestamp,
  event,
  getWorkflow,
  workflowFromRow,
  getVersion,
  getRun,
  runFromRow,
  getSteps,
  getEvents,
} from "./store.js";

function fail(status, code, message, current) {
  const error = new Error(message);
  Object.assign(error, { status, code, current });
  throw error;
}
function object(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "VALIDATION", "Expected a JSON object.");
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail(400, "VALIDATION", "Unknown field in request.");
}
function text(value, name, max, required = false) {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(
      400,
      "VALIDATION",
      `${name} must be ${required ? "nonempty " : ""}text of at most ${max} characters, without NUL.`,
    );
  return required ? value.trim() : value;
}
function id(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    fail(400, "VALIDATION", "Invalid ID.");
  return Number(value);
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    fail(400, "VALIDATION", "A positive integer draft version is required.");
  return value;
}
export function validateSteps(steps, publishing = false) {
  if (
    !Array.isArray(steps) ||
    steps.length > 10 ||
    (publishing && steps.length === 0)
  )
    fail(
      400,
      "VALIDATION",
      publishing
        ? "Publish between 1 and 10 steps."
        : "A draft can have at most 10 steps.",
    );
  return steps.map((step) => {
    object(step, ["type", "name", "prefix", "suffix", "ms"]);
    const name = text(step.name, "Step name", 120, true);
    if (step.type === "transform") {
      object(step, ["type", "name", "prefix", "suffix"]);
      return {
        type: "transform",
        name,
        prefix:
          step.prefix === undefined ? "" : text(step.prefix, "Prefix", 20000),
        suffix:
          step.suffix === undefined ? "" : text(step.suffix, "Suffix", 20000),
      };
    }
    if (step.type === "wait") {
      object(step, ["type", "name", "ms"]);
      if (!Number.isSafeInteger(step.ms) || step.ms < 0 || step.ms > 30000)
        fail(
          400,
          "VALIDATION",
          "Wait duration must be an integer from 0 to 30000 milliseconds.",
        );
      return { type: "wait", name, ms: step.ms };
    }
    if (step.type === "notify") {
      object(step, ["type", "name", "prefix"]);
      return {
        type: "notify",
        name,
        prefix:
          step.prefix === undefined ? "" : text(step.prefix, "Prefix", 20000),
      };
    }
    fail(
      400,
      "VALIDATION",
      "Allowed step types are transform, wait, and notify.",
    );
  });
}
export function createApp(options = {}) {
  const store = createStore(options),
    { db, providerDb } = store,
    app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    const host = req.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))
      return res
        .status(403)
        .json({ error: "Only loopback hosts are allowed.", code: "HOST" });
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["x-relay-request"] !== "1")
        return res
          .status(403)
          .json({ error: "Missing same-origin request header.", code: "CSRF" });
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        return res
          .status(403)
          .json({
            error: "Origin must match this local server.",
            code: "ORIGIN",
          });
    }
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/session", (req, res) => {
    object(req.body, []);
    db.prepare("DELETE FROM sessions WHERE created_at<?").run(
      timestamp(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );
    const old = cookie(req);
    if (old) db.prepare("DELETE FROM sessions WHERE token=?").run(old);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(token,created_at) VALUES(?,?)").run(
      token,
      timestamp(),
    );
    res.setHeader(
      "Set-Cookie",
      `relay_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
    );
    res.json({ user: { name: "Maya Chen" } });
  });
  function cookie(req) {
    const match = /(?:^|;\s*)relay_session=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    );
    return match?.[1];
  }
  app.use("/api", (req, _res, next) => {
    // Session age is enforced server-side on every request: the cookie's
    // Max-Age is a browser hint, not enforcement — a replayed old cookie must
    // still be rejected here (journal/reviews/astra-build.md).
    const token = cookie(req);
    if (
      !token ||
      !db
        .prepare("SELECT 1 FROM sessions WHERE token=? AND created_at>=?")
        .get(token, timestamp(Date.now() - 7 * 24 * 60 * 60 * 1000))
    )
      return next(
        Object.assign(new Error("Open a local operator session to continue."), {
          status: 401,
          code: "UNAUTHENTICATED",
        }),
      );
    req.sessionToken = token;
    next();
  });
  app.get("/api/session", (_req, res) =>
    res.json({ user: { name: "Maya Chen" } }),
  );
  app.delete("/api/session", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.sessionToken);
    res.setHeader(
      "Set-Cookie",
      "relay_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    );
    res.status(204).end();
  });
  const requireWorkflow = (workflowId) => {
    const workflow = getWorkflow(db, workflowId);
    if (!workflow) fail(404, "NOT_FOUND", "Workflow not found.");
    return workflow;
  };
  const requireRun = (runId) => {
    const run = getRun(db, runId);
    if (!run) fail(404, "NOT_FOUND", "Run not found.");
    return run;
  };
  app.get("/api/workflows", (_req, res) =>
    res.json({
      workflows: db
        .prepare("SELECT * FROM workflows ORDER BY id")
        .all()
        .map(workflowFromRow),
    }),
  );
  app.post("/api/workflows", (req, res) => {
    object(req.body, ["name", "description"]);
    const name = text(req.body.name, "Name", 120, true),
      description =
        req.body.description === undefined
          ? ""
          : text(req.body.description, "Description", 1000);
    const now = timestamp(),
      result = db
        .prepare(
          "INSERT INTO workflows(name,description,created_at,updated_at) VALUES(?,?,?,?)",
        )
        .run(name, description, now, now);
    res
      .status(201)
      .json({ workflow: getWorkflow(db, Number(result.lastInsertRowid)) });
  });
  app.get("/api/workflows/:id", (req, res) => {
    const workflowId = id(req.params.id),
      workflow = requireWorkflow(workflowId);
    const versions = db
      .prepare(
        "SELECT number FROM workflow_versions WHERE workflow_id=? ORDER BY number DESC",
      )
      .all(workflowId)
      .map((row) => getVersion(db, workflowId, row.number));
    res.json({ workflow, versions });
  });
  app.patch("/api/workflows/:id", (req, res) => {
    const workflowId = id(req.params.id);
    object(req.body, ["version", "name", "description", "draftSteps"]);
    const expected = version(req.body.version);
    if (Object.keys(req.body).length === 1)
      fail(400, "VALIDATION", "Provide at least one draft field to update.");
    const workflow = transaction(db, () => {
      const current = requireWorkflow(workflowId);
      if (expected !== current.version)
        fail(
          409,
          "VERSION_CONFLICT",
          "This draft changed elsewhere. Your changes have not been saved.",
          current,
        );
      const name =
        req.body.name === undefined
          ? current.name
          : text(req.body.name, "Name", 120, true);
      const description =
        req.body.description === undefined
          ? current.description
          : text(req.body.description, "Description", 1000);
      const steps =
        req.body.draftSteps === undefined
          ? current.draftSteps
          : validateSteps(req.body.draftSteps);
      db.prepare(
        "UPDATE workflows SET name=?,description=?,draft_steps=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).run(
        name,
        description,
        JSON.stringify(steps),
        timestamp(),
        workflowId,
        expected,
      );
      return getWorkflow(db, workflowId);
    });
    res.json({ workflow });
  });
  app.post("/api/workflows/:id/publish", (req, res) => {
    const workflowId = id(req.params.id);
    object(req.body, ["version"]);
    const expected = version(req.body.version);
    const result = transaction(db, () => {
      const current = requireWorkflow(workflowId);
      if (expected !== current.version)
        fail(
          409,
          "VERSION_CONFLICT",
          "This draft changed elsewhere. Reload it before publishing.",
          current,
        );
      const steps = validateSteps(current.draftSteps, true),
        number = (current.publishedVersion || 0) + 1,
        now = timestamp();
      db.prepare(
        "INSERT INTO workflow_versions(workflow_id,number,steps,created_at) VALUES(?,?,?,?)",
      ).run(workflowId, number, JSON.stringify(steps), now);
      db.prepare(
        "UPDATE workflows SET published_version=?,version=version+1,updated_at=? WHERE id=?",
      ).run(number, now, workflowId);
      return {
        workflow: getWorkflow(db, workflowId),
        published: getVersion(db, workflowId, number),
      };
    });
    res.json(result);
  });
  app.post("/api/workflows/:id/runs", (req, res) => {
    const workflowId = id(req.params.id);
    object(req.body, ["input", "idempotencyKey"]);
    object(req.body.input, ["text"]);
    const input = { text: text(req.body.input.text, "Input text", 10000) },
      key = text(req.body.idempotencyKey, "Idempotency key", 120, true);
    if (!/^[A-Za-z0-9._:-]+$/.test(key))
      fail(
        400,
        "VALIDATION",
        "Idempotency key may contain letters, numbers, dots, underscores, colons, or hyphens.",
      );
    // The request key is bound to this exact intent (workflow + input). A
    // replay returns the original run — even if a newer version has been
    // published since — and a reused key with a different intent is a 409.
    const intent = JSON.stringify({ workflowId, input });
    const result = transaction(db, () => {
      const workflow = requireWorkflow(workflowId),
        previous = db
          .prepare("SELECT * FROM runs WHERE request_key=?")
          .get(key);
      if (previous) {
        if (previous.request_intent !== intent)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used for a different run request.",
          );
        return { run: runFromRow(previous), replay: true };
      }
      if (!workflow.publishedVersion)
        fail(409, "NOT_PUBLISHED", "Publish a version before starting a run.");
      const now = timestamp(),
        inserted = db
          .prepare(
            "INSERT INTO runs(workflow_id,workflow_version,workflow_name,status,input,request_key,request_intent,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?,?)",
          )
          .run(
            workflowId,
            workflow.publishedVersion,
            workflow.name,
            JSON.stringify(input),
            key,
            intent,
            now,
            now,
          );
      const runId = Number(inserted.lastInsertRowid);
      event(
        db,
        runId,
        "queued",
        `Run queued against immutable workflow version ${workflow.publishedVersion}.`,
      );
      return { run: getRun(db, runId), replay: false };
    });
    res.status(result.replay ? 200 : 201).json({ run: result.run });
  });
  app.get("/api/runs", (_req, res) =>
    res.json({
      runs: db
        .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 200")
        .all()
        .map(runFromRow),
    }),
  );
  app.get("/api/runs/:id", (req, res) => {
    const runId = id(req.params.id),
      run = requireRun(runId);
    res.json({
      run,
      steps: getSteps(db, runId),
      events: getEvents(db, runId),
      definition: getVersion(db, run.workflowId, run.workflowVersion),
    });
  });
  app.post("/api/runs/:id/cancel", (req, res) => {
    const runId = id(req.params.id);
    object(req.body, []);
    const run = transaction(db, () => {
      const current = requireRun(runId);
      if (current.status === "cancelled") return current;
      if (["succeeded", "failed"].includes(current.status))
        fail(409, "TERMINAL_RUN", "This run has already finished.");
      const now = timestamp();
      db.prepare(
        "UPDATE runs SET status='cancelled',lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,finished_at=?,updated_at=? WHERE id=?",
      ).run(now, now, runId);
      event(
        db,
        runId,
        "cancelled",
        "Operator cancelled the run. Already accepted notifications cannot be undone.",
      );
      return getRun(db, runId);
    });
    res.json({ run });
  });
  app.post("/api/runs/:id/retry", (req, res) => {
    const runId = id(req.params.id);
    object(req.body, []);
    const run = transaction(db, () => {
      const current = requireRun(runId);
      if (current.status !== "failed")
        fail(
          409,
          "NOT_RETRYABLE",
          "Only a failed run can be retried. Cancelled runs stay cancelled.",
        );
      db.prepare(
        "UPDATE runs SET status='queued',retry_count=0,error=NULL,next_attempt_at=NULL,finished_at=NULL,updated_at=? WHERE id=?",
      ).run(timestamp(), runId);
      event(
        db,
        runId,
        "manual_retry",
        "Operator retried this run. Finished steps and notification keys are preserved.",
      );
      return getRun(db, runId);
    });
    res.json({ run });
  });
  app.get("/api/provider/receipts", (_req, res) =>
    res.json({
      receipts: providerDb
        .prepare(
          "SELECT id,key,message,created_at AS createdAt FROM receipts ORDER BY id DESC LIMIT 200",
        )
        .all(),
    }),
  );
  app.get("/api/summary", (_req, res) => {
    const counts = Object.fromEntries(
      db
        .prepare("SELECT status,count(*) AS n FROM runs GROUP BY status")
        .all()
        .map((row) => [row.status, row.n]),
    );
    const worker = db
      .prepare("SELECT max(last_seen_at) AS lastSeenAt FROM workers")
      .get();
    res.json({
      workflowCount: db.prepare("SELECT count(*) AS n FROM workflows").get().n,
      runCount: Object.values(counts).reduce((a, b) => a + b, 0),
      activeCount:
        (counts.queued || 0) +
        (counts.running || 0) +
        (counts.waiting_retry || 0),
      succeededCount: counts.succeeded || 0,
      failedCount: counts.failed || 0,
      receiptCount: providerDb
        .prepare("SELECT count(*) AS n FROM receipts")
        .get().n,
      worker: {
        online: !!worker.lastSeenAt && Date.now() - worker.lastSeenAt < 10000,
        lastSeenAt: worker.lastSeenAt ? timestamp(worker.lastSeenAt) : null,
      },
    });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found.", code: "NOT_FOUND" }),
  );
  app.use(
    express.static(fileURLToPath(new URL("../public/", import.meta.url)), {
      index: "index.html",
    }),
  );
  app.use((error, _req, res, _next) => {
    const status =
      error.status || (error.type === "entity.too.large" ? 413 : 500);
    if (status >= 500) console.error("Relay request failed:", error.message);
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "The local server could not complete this request."
            : error.message,
        code:
          error.code ||
          (status === 413
            ? "TOO_LARGE"
            : status === 400
              ? "VALIDATION"
              : "INTERNAL"),
        ...(error.current ? { current: error.current } : {}),
      });
  });
  return { app, ...store };
}
