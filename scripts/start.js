import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
const children = ["../src/server.js", "../src/worker.js"].map((path) =>
  fork(fileURLToPath(new URL(path, import.meta.url)), [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  }),
);
let stopping = false;
function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  // Graceful IPC shutdown first, forced kill only as the fallback below. Both
  // ends must drop their IPC channels: on Windows a referenced channel keeps
  // an otherwise-finished child alive (journal/reviews/astra-build.md).
  for (const child of children) if (child.connected) child.send("shutdown");
  if (process.connected) process.disconnect();
  const timeout = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill();
  }, 4500);
  timeout.unref();
}
process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());
process.on("message", (message) => {
  if (message === "shutdown") shutdown();
});
children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error.message);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!stopping) shutdown(code || 0);
  });
});
