import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createStore,
  claimRun,
  checkpointStep,
  renewLease,
  leaseIsCurrent,
  finishRun,
  failRun,
  getVersion,
  getSteps,
  assertOutput,
  acceptNotification,
} from "./store.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function executeClaim(
  store,
  claim,
  {
    leaseMs = 3000,
    maxAttempts = 3,
    retryDelayMs = 500,
    transientFailures = 0,
    crashAfterEffect = false,
    shouldStop = () => false,
  } = {},
) {
  const { db, providerDb } = store,
    runId = claim.id,
    token = claim.leaseToken;
  let leaseLost = false;
  const heartbeat = setInterval(
    () => {
      try {
        if (!renewLease(db, runId, token, { leaseMs })) leaseLost = true;
        db.prepare("UPDATE workers SET last_seen_at=? WHERE id=?").run(
          Date.now(),
          claim.leaseOwner,
        );
      } catch {
        leaseLost = true;
      }
    },
    Math.max(25, Math.floor(leaseMs / 3)),
  );
  const current = () =>
    !leaseLost && !shouldStop() && leaseIsCurrent(db, runId, token);
  try {
    const definition = getVersion(db, claim.workflowId, claim.workflowVersion),
      checkpoints = getSteps(db, runId);
    let output = checkpoints.at(-1)?.output || claim.input;
    for (
      let index = checkpoints.length;
      index < definition.steps.length;
      index++
    ) {
      if (!current()) return { status: "lease_lost" };
      const step = definition.steps[index];
      if (step.type === "transform")
        output = {
          text: (step.prefix || "") + output.text + (step.suffix || ""),
        };
      else if (step.type === "wait") {
        const deadline = Date.now() + step.ms;
        while (Date.now() < deadline) {
          await sleep(Math.min(100, deadline - Date.now()));
          if (!current()) return { status: "lease_lost" };
        }
      } else if (step.type === "notify") {
        if (claim.attempt <= transientFailures) {
          const error = new Error(
            "Simulated transient provider unavailability.",
          );
          error.transient = true;
          throw error;
        }
        const message = (step.prefix || "") + output.text;
        assertOutput({ text: message });
        if (!current()) return { status: "lease_lost" };
        const receipt = acceptNotification(
          providerDb,
          `${runId}:${index}`,
          message,
        );
        if (crashAfterEffect) {
          console.log(
            `Relay fault: provider accepted ${receipt.key}; exiting before checkpoint.`,
          );
          process.exit(86);
        }
        output = { text: receipt.message };
      }
      assertOutput(output);
      if (!current() || !checkpointStep(db, runId, token, { index, output }))
        return { status: "lease_lost" };
    }
    return { status: finishRun(db, runId, token) ? "succeeded" : "lease_lost" };
  } catch (error) {
    const saved = failRun(db, runId, token, error.message, {
      transient: error.transient === true,
      maxAttempts,
      retryDelayMs,
    });
    return {
      status: saved ? "failure_recorded" : "lease_lost",
      error: error.message,
    };
  } finally {
    clearInterval(heartbeat);
  }
}
export async function runWorker({
  dbPath = "data/relay.sqlite",
  providerDbPath = "data/provider.sqlite",
  leaseMs = 3000,
  pollMs = 150,
  workerId = randomUUID(),
  maxAttempts = 3,
  retryDelayMs = 500,
  transientFailures = 0,
  crashAfterEffect = false,
  signal,
  store: providedStore,
} = {}) {
  const store = providedStore || createStore({ dbPath, providerDbPath });
  const stopping = () => signal?.aborted;
  console.log(`Relay worker ready ${workerId}`);
  try {
    while (!stopping()) {
      const claim = claimRun(store.db, workerId, { leaseMs });
      if (claim)
        await executeClaim(store, claim, {
          leaseMs,
          maxAttempts,
          retryDelayMs,
          transientFailures,
          crashAfterEffect,
          shouldStop: stopping,
        });
      else await sleep(pollMs);
    }
  } finally {
    if (!providedStore) store.close();
  }
}
function envInteger(name, fallback, min, max) {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  process.on("message", (message) => {
    if (message === "shutdown") controller.abort();
  });
  runWorker({
    dbPath: process.env.DB_PATH || "data/relay.sqlite",
    providerDbPath: process.env.PROVIDER_DB_PATH || "data/provider.sqlite",
    leaseMs: envInteger("LEASE_MS", 3000, 100, 300000),
    pollMs: envInteger("POLL_MS", 150, 10, 10000),
    maxAttempts: envInteger("MAX_ATTEMPTS", 3, 1, 10),
    retryDelayMs: envInteger("RETRY_DELAY_MS", 500, 10, 30000),
    transientFailures: envInteger("TRANSIENT_FAILURES", 0, 0, 100),
    crashAfterEffect: process.env.CRASH_AFTER_EFFECT_ONCE === "1",
    signal: controller.signal,
  })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      if (process.connected) process.disconnect();
    });
}
