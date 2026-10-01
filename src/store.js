import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const MAX_OUTPUT_BYTES = 64000;
export const timestamp = (now = Date.now()) => new Date(now).toISOString();
export function transaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function open(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
  );
  return db;
}
export function event(db, runId, kind, detail, now = Date.now()) {
  db.prepare(
    "INSERT INTO events(run_id,kind,detail,created_at) VALUES(?,?,?,?)",
  ).run(runId, kind, detail, timestamp(now));
}
export function createStore({
  dbPath = ":memory:",
  providerDbPath = ":memory:",
  seed = true,
} = {}) {
  if (
    dbPath !== ":memory:" &&
    providerDbPath !== ":memory:" &&
    resolve(dbPath) === resolve(providerDbPath)
  )
    throw new Error("App and provider databases must be separate files.");
  const db = open(dbPath),
    providerDb = open(providerDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1, draft_steps TEXT NOT NULL DEFAULT '[]',
      published_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id INTEGER PRIMARY KEY, workflow_id INTEGER NOT NULL REFERENCES workflows(id),
      number INTEGER NOT NULL, steps TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(workflow_id, number)
    );
    CREATE TRIGGER IF NOT EXISTS versions_immutable_update BEFORE UPDATE ON workflow_versions
      BEGIN SELECT RAISE(ABORT, 'Published versions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS versions_immutable_delete BEFORE DELETE ON workflow_versions
      BEGIN SELECT RAISE(ABORT, 'Published versions are immutable'); END;
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY, workflow_id INTEGER NOT NULL REFERENCES workflows(id),
      workflow_version INTEGER NOT NULL, workflow_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_retry','succeeded','failed','cancelled')),
      input TEXT NOT NULL, output TEXT, error TEXT, attempt INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER,
      lease_token TEXT, lease_owner TEXT, lease_expires_at INTEGER,
      request_key TEXT NOT NULL UNIQUE, request_intent TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
      FOREIGN KEY(workflow_id,workflow_version) REFERENCES workflow_versions(workflow_id,number)
    );
    CREATE TABLE IF NOT EXISTS run_steps (
      id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES runs(id),
      step_index INTEGER NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL,
      output TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(run_id,step_index)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES runs(id),
      kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, last_seen_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS runs_claim ON runs(status,next_attempt_at,lease_expires_at);
    CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
  `);
  providerDb.exec(`CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, message TEXT NOT NULL, created_at TEXT NOT NULL
  );`);
  if (seed)
    transaction(db, () => {
      if (db.prepare("SELECT count(*) AS n FROM workflows").get().n) return;
      const now = timestamp();
      const seeds = [
        [
          "Welcome aboard",
          "Turn a new teammate’s name into a warm welcome, then deliver it to the local inbox.",
          [
            {
              type: "transform",
              name: "Compose a warm welcome",
              prefix: "Welcome to the team, ",
              suffix: "! We’re glad you’re here.",
            },
            { type: "wait", name: "Take a short breath", ms: 1200 },
            {
              type: "notify",
              name: "Send the welcome",
              prefix: "People team · ",
            },
          ],
        ],
        [
          "Release notes",
          "Polish a release update and send a durable notification to your simulated team channel.",
          [
            {
              type: "transform",
              name: "Format the announcement",
              prefix: "Just shipped: ",
              suffix: " ✨",
            },
            {
              type: "notify",
              name: "Share with the team",
              prefix: "Release channel · ",
            },
          ],
        ],
      ];
      for (const [name, description, steps] of seeds) {
        const id = Number(
          db
            .prepare(
              "INSERT INTO workflows(name,description,draft_steps,published_version,created_at,updated_at) VALUES(?,?,?,1,?,?)",
            )
            .run(name, description, JSON.stringify(steps), now, now)
            .lastInsertRowid,
        );
        db.prepare(
          "INSERT INTO workflow_versions(workflow_id,number,steps,created_at) VALUES(?,1,?,?)",
        ).run(id, JSON.stringify(steps), now);
      }
    });
  let closed = false;
  return {
    db,
    providerDb,
    close() {
      if (!closed) {
        closed = true;
        db.close();
        providerDb.close();
      }
    },
  };
}
export function workflowFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    draftSteps: JSON.parse(row.draft_steps),
    publishedVersion: row.published_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function getWorkflow(db, id) {
  return workflowFromRow(
    db.prepare("SELECT * FROM workflows WHERE id=?").get(id),
  );
}
export function runFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
    status: row.status,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : null,
    error: row.error,
    attempt: row.attempt,
    retryCount: row.retry_count,
    nextAttemptAt: row.next_attempt_at ? timestamp(row.next_attempt_at) : null,
    leaseExpiresAt: row.lease_expires_at
      ? timestamp(row.lease_expires_at)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
export function getRun(db, id) {
  return runFromRow(db.prepare("SELECT * FROM runs WHERE id=?").get(id));
}
export function getVersion(db, workflowId, number) {
  const row = db
    .prepare("SELECT * FROM workflow_versions WHERE workflow_id=? AND number=?")
    .get(workflowId, number);
  return row
    ? {
        id: row.id,
        workflowId: row.workflow_id,
        number: row.number,
        steps: JSON.parse(row.steps),
        createdAt: row.created_at,
      }
    : null;
}
export function getSteps(db, runId) {
  return db
    .prepare("SELECT * FROM run_steps WHERE run_id=? ORDER BY step_index")
    .all(runId)
    .map((row) => ({
      id: row.id,
      runId: row.run_id,
      index: row.step_index,
      type: row.type,
      name: row.name,
      status: "succeeded",
      output: JSON.parse(row.output),
      createdAt: row.created_at,
    }));
}
export function getEvents(db, runId) {
  return db
    .prepare(
      "SELECT id,kind,detail,created_at AS createdAt FROM events WHERE run_id=? ORDER BY id",
    )
    .all(runId);
}
export function assertOutput(output) {
  if (
    !output ||
    typeof output !== "object" ||
    typeof output.text !== "string" ||
    Object.keys(output).length !== 1 ||
    output.text.includes("\0")
  )
    throw new Error("Step output must be a text object.");
  const json = JSON.stringify(output);
  if (Buffer.byteLength(json, "utf8") > MAX_OUTPUT_BYTES)
    throw new Error(
      `Step output exceeds the ${MAX_OUTPUT_BYTES}-byte inline storage limit.`,
    );
  return json;
}
export function claimRun(
  db,
  workerId,
  { leaseMs = 3000, now: suppliedNow } = {},
) {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 300000)
    throw new Error("Invalid lease duration.");
  return transaction(db, () => {
    const now = suppliedNow ?? Date.now();
    db.prepare(
      "INSERT INTO workers(id,last_seen_at) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at",
    ).run(workerId, now);
    const row = db
      .prepare(
        `SELECT * FROM runs WHERE status='queued' OR (status='waiting_retry' AND next_attempt_at<=?) OR (status='running' AND lease_expires_at<=?) ORDER BY id LIMIT 1`,
      )
      .get(now, now);
    if (!row) return null;
    const leaseToken = randomUUID();
    db.prepare(
      `UPDATE runs SET status='running',attempt=attempt+1,lease_token=?,lease_owner=?,lease_expires_at=?,next_attempt_at=NULL,updated_at=?,started_at=COALESCE(started_at,?) WHERE id=?`,
    ).run(
      leaseToken,
      workerId,
      now + leaseMs,
      timestamp(now),
      timestamp(now),
      row.id,
    );
    event(
      db,
      row.id,
      row.status === "running" ? "reclaimed" : "claimed",
      row.status === "running"
        ? "Expired worker lease reclaimed; resuming from durable checkpoints."
        : "Worker claimed this run.",
      now,
    );
    return { ...getRun(db, row.id), leaseToken, leaseOwner: workerId };
  });
}
export function leaseIsCurrent(db, runId, token, now = Date.now()) {
  return !!db
    .prepare(
      "SELECT 1 FROM runs WHERE id=? AND lease_token=? AND status='running' AND lease_expires_at>?",
    )
    .get(runId, token, now);
}
export function renewLease(
  db,
  runId,
  token,
  { leaseMs = 3000, now: suppliedNow } = {},
) {
  return transaction(db, () => {
    const now = suppliedNow ?? Date.now();
    const result = db
      .prepare(
        "UPDATE runs SET lease_expires_at=? WHERE id=? AND lease_token=? AND status='running' AND lease_expires_at>?",
      )
      .run(now + leaseMs, runId, token, now);
    return result.changes === 1;
  });
}
export function checkpointStep(
  db,
  runId,
  token,
  { index, output, now: suppliedNow },
) {
  const json = assertOutput(output);
  return transaction(db, () => {
    const now = suppliedNow ?? Date.now();
    if (!leaseIsCurrent(db, runId, token, now)) return false;
    const run = getRun(db, runId),
      version = getVersion(db, run.workflowId, run.workflowVersion),
      step = version.steps[index];
    if (!step || !Number.isSafeInteger(index) || index < 0)
      throw new Error("Invalid checkpoint index.");
    const existing = db
      .prepare("SELECT output FROM run_steps WHERE run_id=? AND step_index=?")
      .get(runId, index);
    if (existing) return existing.output === json;
    const count = db
      .prepare("SELECT count(*) AS n FROM run_steps WHERE run_id=?")
      .get(runId).n;
    if (count !== index)
      throw new Error("Checkpoints must be saved in step order.");
    db.prepare(
      "INSERT INTO run_steps(run_id,step_index,type,name,output,created_at) VALUES(?,?,?,?,?,?)",
    ).run(runId, index, step.type, step.name, json, timestamp(now));
    db.prepare("UPDATE runs SET output=?,updated_at=? WHERE id=?").run(
      json,
      timestamp(now),
      runId,
    );
    event(
      db,
      runId,
      "checkpoint",
      `Step ${index + 1}: ${step.name} saved durably.`,
      now,
    );
    return true;
  });
}
export function finishRun(db, runId, token, { now: suppliedNow } = {}) {
  return transaction(db, () => {
    const now = suppliedNow ?? Date.now();
    if (!leaseIsCurrent(db, runId, token, now)) return false;
    const run = getRun(db, runId),
      version = getVersion(db, run.workflowId, run.workflowVersion);
    if (getSteps(db, runId).length !== version.steps.length)
      throw new Error("Cannot finish an incomplete run.");
    db.prepare(
      "UPDATE runs SET status='succeeded',error=NULL,finished_at=?,updated_at=?,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=?",
    ).run(timestamp(now), timestamp(now), runId);
    event(
      db,
      runId,
      "succeeded",
      "All steps completed. Inline outputs are stored in the app database.",
      now,
    );
    return true;
  });
}
export function failRun(
  db,
  runId,
  token,
  error,
  {
    transient = false,
    maxAttempts = 3,
    retryDelayMs = 500,
    now: suppliedNow,
  } = {},
) {
  return transaction(db, () => {
    const now = suppliedNow ?? Date.now();
    if (!leaseIsCurrent(db, runId, token, now)) return false;
    const row = db
      .prepare("SELECT retry_count FROM runs WHERE id=?")
      .get(runId);
    const retryCount = row.retry_count + 1,
      retry = transient && retryCount < maxAttempts;
    const status = retry ? "waiting_retry" : "failed";
    db.prepare(
      "UPDATE runs SET status=?,error=?,retry_count=?,next_attempt_at=?,updated_at=?,finished_at=?,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=?",
    ).run(
      status,
      String(error).slice(0, 2000),
      retryCount,
      retry ? now + retryDelayMs * 2 ** Math.min(retryCount - 1, 6) : null,
      timestamp(now),
      retry ? null : timestamp(now),
      runId,
    );
    event(
      db,
      runId,
      retry ? "retry_scheduled" : "failed",
      retry
        ? `Transient failure. Retry ${retryCount} of ${maxAttempts - 1} scheduled durably: ${error}`
        : `Run failed: ${error}`,
      now,
    );
    return true;
  });
}
export function acceptNotification(providerDb, key, message, now = Date.now()) {
  assertOutput({ text: message });
  return transaction(providerDb, () => {
    const existing = providerDb
      .prepare(
        "SELECT id,key,message,created_at AS createdAt FROM receipts WHERE key=?",
      )
      .get(key);
    if (existing) {
      if (existing.message !== message)
        throw new Error(
          "Provider idempotency key reused with a different message.",
        );
      return { ...existing, replayed: true };
    }
    const id = Number(
      providerDb
        .prepare("INSERT INTO receipts(key,message,created_at) VALUES(?,?,?)")
        .run(key, message, timestamp(now)).lastInsertRowid,
    );
    return { id, key, message, createdAt: timestamp(now), replayed: false };
  });
}
