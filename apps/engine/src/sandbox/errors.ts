/**
 * Sandbox error taxonomy (S09). A code step fails in a small closed set of ways, so the engine (and the
 * builder UI) can react per class: a limit breach is the user's runaway loop, a runtime error is their
 * bug, a blocked-egress is a security stop. Never let raw V8/host errors leak upward with host paths.
 */
export type SandboxErrorKind = "SandboxTimeout" | "SandboxMemory" | "SandboxRuntimeError" | "SandboxBlockedEgress";

export class SandboxError extends Error {
  constructor(
    public readonly kind: SandboxErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

export class SandboxTimeout extends SandboxError {
  constructor(ms: number) {
    super("SandboxTimeout", `code step exceeded its ${ms}ms deadline`);
  }
}
export class SandboxRuntimeError extends SandboxError {
  constructor(message: string) {
    super("SandboxRuntimeError", `code step threw: ${message}`);
  }
}
export class SandboxBlockedEgress extends SandboxError {
  constructor(message: string) {
    super("SandboxBlockedEgress", message);
  }
}
