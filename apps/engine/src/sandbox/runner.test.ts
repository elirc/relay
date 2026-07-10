import { describe, it, expect } from "vitest";
import { runCode } from "./runner";
import { SandboxTimeout, SandboxRuntimeError } from "./errors";

describe("sandbox runner — controlled surface", () => {
  it("injects input and extracts the returned output", () => {
    expect(runCode("return input.a + input.b", { input: { a: 2, b: 3 } }).output).toBe(5);
  });

  it("captures console.log for debugging", () => {
    const { logs } = runCode("console.log('hi', 42); console.log({x:1}); return null");
    expect(logs).toEqual(["hi 42", '{"x":1}']);
  });

  it("grants NO ambient globals — require/process/fetch/Buffer/setTimeout are all undefined", () => {
    const out = runCode(
      "return [typeof require, typeof process, typeof fetch, typeof Buffer, typeof setTimeout]",
    ).output;
    expect(out).toEqual(["undefined", "undefined", "undefined", "undefined", "undefined"]);
  });

  it("a require() escape attempt just fails — the module system isn't on the surface", () => {
    expect(() => runCode("return require('fs').readFileSync('/etc/passwd')")).toThrow(SandboxRuntimeError);
  });

  it("enforces the wall-clock deadline OUTSIDE the guest — an infinite loop is killed", () => {
    expect(() => runCode("while (true) {}", { timeoutMs: 50 })).toThrow(SandboxTimeout);
  });

  it("surfaces a user runtime error as a typed SandboxRuntimeError, not a raw host error", () => {
    expect(() => runCode("throw new Error('boom')")).toThrow(SandboxRuntimeError);
  });

  it("caps captured output — the poison pill can't OOM the worker (flaw #5 fix)", () => {
    const { logs } = runCode("for (let i = 0; i < 100000; i++) console.log('x'.repeat(50)); return 1", {
      maxLogLines: 100,
      timeoutMs: 3000,
    });
    expect(logs.length).toBeLessThanOrEqual(101); // 100 lines + one truncation marker, not 100,000
    expect(logs[logs.length - 1]).toContain("truncated");
  });
});
