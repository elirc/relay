import { describe, it, expect } from "vitest";
import { isBlockedTarget, assertUrlAllowed } from "./ssrf";
import { SandboxBlockedEgress } from "./errors";

describe("SSRF blocklist", () => {
  it("blocks loopback, private ranges, link-local, and the cloud metadata endpoint", () => {
    for (const h of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.5.5", "169.254.169.254", "localhost", "::1"]) {
      expect(isBlockedTarget(h)).toBe(true);
    }
    expect(isBlockedTarget("metadata.google.internal")).toBe(true);
  });

  it("allows genuine public hosts", () => {
    expect(isBlockedTarget("api.example.com")).toBe(false);
    expect(isBlockedTarget("8.8.8.8")).toBe(false);
  });
});

describe("assertUrlAllowed (allowlist + blocklist, belt and suspenders)", () => {
  const allow = ["example.com"];

  it("allows an allowlisted public host", () => {
    expect(assertUrlAllowed("https://api.example.com/v1", allow).hostname).toBe("api.example.com");
  });

  it("rejects a public host that isn't in the allowlist", () => {
    expect(() => assertUrlAllowed("https://evil.test/x", allow)).toThrow(/not in org allowlist/);
  });

  it("rejects the metadata endpoint even if someone tried to allowlist it", () => {
    expect(() => assertUrlAllowed("http://169.254.169.254/latest/meta-data/", ["169.254.169.254"])).toThrow(
      SandboxBlockedEgress,
    );
  });

  it("rejects non-http(s) schemes (no file://, no gopher SSRF)", () => {
    expect(() => assertUrlAllowed("file:///etc/passwd", allow)).toThrow(/http/);
  });
});
