import vm from "node:vm";
import { SandboxTimeout, SandboxRuntimeError } from "./errors";

/**
 * The code-step runner (S09). It runs user JavaScript with a **controlled surface** and a **wall-clock
 * deadline**, and extracts a return value. The security stance is **subtraction, not addition**: the
 * context starts EMPTY and we grant only `input` and `console` — there is no `require`, `process`,
 * `fetch`, `globalThis`, `Buffer`, or `setTimeout`. Allowlist, never denylist: you cannot enumerate
 * every escape, so you expose a tiny surface and add to it deliberately (same philosophy as the S04
 * expression language, stakes raised).
 *
 * ⚠️ HONEST BOUNDARY: `node:vm` is a teaching stand-in, NOT a security boundary on its own — a
 * determined attacker can reach out of a bare `vm` context via `this.constructor.constructor`. Production
 * uses **isolated-vm** (a real, separate V8 isolate) or **worker_threads**, and ADR-0011 states exactly
 * what each contains. What IS real and portable here — and what the course teaches — is the architecture
 * around the isolate: the controlled surface, the OUTSIDE-the-isolate deadline, output extraction, the
 * error taxonomy, and the SSRF/allowlist egress door. Swap the isolate; keep all of this.
 */
export interface SandboxResult {
  output: unknown;
  logs: string[];
}

export interface SandboxOptions {
  input?: unknown;
  timeoutMs?: number;
}

export function runCode(source: string, opts: SandboxOptions = {}): SandboxResult {
  const timeoutMs = opts.timeoutMs ?? 1000;
  const logs: string[] = [];

  // The ENTIRE surface the user code can see. Anything not here is undefined inside.
  const sandbox = {
    input: opts.input,
    console: {
      // Capture logs for debugging. NOTE: this buffer is unbounded — see the sandbox review checklist.
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
    },
  };
  const context = vm.createContext(sandbox);

  // Wrap so the user writes a function body that `return`s. The deadline is enforced by vm's `timeout`,
  // which runs OUTSIDE the guest: you can't trust in-sandbox time (a guest `setTimeout` isn't a limit),
  // so the wall-clock kill lives in the host.
  const wrapped = `(function(input, console){\n${source}\n})(input, console)`;
  try {
    const output = vm.runInContext(wrapped, context, { timeout: timeoutMs });
    return { output, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timed out/i.test(msg)) throw new SandboxTimeout(timeoutMs);
    throw new SandboxRuntimeError(msg);
  }
}
