import assert from "node:assert/strict";
import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
test(
  "start supervisor initializes both stores, runs work, and closes both children through IPC",
  { timeout: 25000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "relay-lifecycle-"));
    const child = fork(join(root, "scripts/start.js"), [], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: "0",
        DB_PATH: join(folder, "app.sqlite"),
        PROVIDER_DB_PATH: join(folder, "provider.sqlite"),
        POLL_MS: "30",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "",
      errors = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      errors += chunk;
    });
    try {
      const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error("Supervisor startup timed out: " + output + errors),
            ),
          10000,
        );
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`Early supervisor exit ${code}: ${errors}`));
        });
        child.stdout.setEncoding("utf8").on("data", (chunk) => {
          output += chunk;
          const match = output.match(/Relay ready (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
      });
      const session = await fetch(url + "/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Relay-Request": "1" },
        body: "{}",
      });
      assert.equal(session.status, 200);
      const cookie = session.headers.get("set-cookie").split(";")[0];
      const headers = {
        cookie,
        "Content-Type": "application/json",
        "X-Relay-Request": "1",
      };
      const response = await fetch(url + "/api/workflows/2/runs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          input: { text: "Supervisor proof" },
          idempotencyKey: "supervisor-proof",
        }),
      });
      assert.equal(response.status, 201);
      const { run } = await response.json();
      const deadline = Date.now() + 10000;
      let detail;
      do {
        detail = await (
          await fetch(url + `/api/runs/${run.id}`, { headers })
        ).json();
        if (detail.run.status === "succeeded") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (Date.now() < deadline);
      assert.equal(detail.run.status, "succeeded", output + errors);
      const receipts = await (
        await fetch(url + "/api/provider/receipts", { headers })
      ).json();
      assert.equal(receipts.receipts.length, 1);
      const exited = once(child, "exit");
      const stoppedAt = Date.now();
      child.send("shutdown");
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 6500);
      const [code] = await exited;
      clearTimeout(timeout);
      assert.equal(
        code,
        0,
        "supervisor should exit cleanly, not be force-terminated",
      );
      assert.ok(
        Date.now() - stoppedAt < 4000,
        "shutdown should not need the 4.5-second forced-child-kill fallback",
      );
      await assert.rejects(
        fetch(url + "/api/health"),
        "web child should no longer listen",
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === "win32") {
          try {
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
              windowsHide: true,
            });
          } catch {}
        } else child.kill("SIGKILL");
      }
      const resolved = await realpath(folder);
      assert.equal(
        dirname(resolved).toLowerCase(),
        (await realpath(tmpdir())).toLowerCase(),
      );
      assert.ok(basename(resolved).startsWith("relay-lifecycle-"));
      await rm(resolved, { recursive: true, force: true });
    }
  },
);
