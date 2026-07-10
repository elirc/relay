import { describe, it, expect } from "vitest";
import {
  parseKek,
  generateDek,
  wrapDek,
  unwrapDek,
  seal,
  open,
  rewrapDek,
} from "./envelope";
import { randomBytes } from "node:crypto";

const kek = randomBytes(32);

describe("envelope encryption", () => {
  it("round-trips a token through DEK seal/open", () => {
    const dek = generateDek();
    const token = "ya29.a0Af_secret_access_token";
    const sealed = seal(token, dek);
    expect(sealed).not.toContain(token); // never plaintext at rest
    expect(open(sealed, dek)).toBe(token);
  });

  it("wraps and unwraps a DEK with the KEK", () => {
    const dek = generateDek();
    const wrapped = wrapDek(dek, kek);
    expect(unwrapDek(wrapped, kek).equals(dek)).toBe(true);
  });

  it("a DB leak without the KEK is useless (wrong KEK cannot unwrap)", () => {
    const dek = generateDek();
    const wrapped = wrapDek(dek, kek);
    const attackerKek = randomBytes(32);
    expect(() => unwrapDek(wrapped, attackerKek)).toThrow();
  });

  it("tampered ciphertext fails the auth tag instead of returning garbage", () => {
    const dek = generateDek();
    const sealed = seal("hunter2", dek);
    // flip a character in the base64 body
    const [v, body] = sealed.split(":");
    const tampered = `${v}:${body.slice(0, -2)}${body.slice(-2) === "AA" ? "BB" : "AA"}`;
    expect(() => open(tampered, dek)).toThrow();
  });

  it("KEK rotation re-wraps the DEK WITHOUT touching token ciphertext", () => {
    const dek = generateDek();
    const token = "refresh_token_xyz";
    const sealedToken = seal(token, dek); // encrypted under the DEK

    const wrapped = wrapDek(dek, kek);
    const newKek = randomBytes(32);
    const rewrapped = rewrapDek(wrapped, kek, newKek);

    // The token ciphertext is unchanged; only the wrapped DEK changed.
    const dekAfter = unwrapDek(rewrapped, newKek);
    expect(open(sealedToken, dekAfter)).toBe(token);
    expect(() => unwrapDek(rewrapped, kek)).toThrow(); // old KEK no longer works
  });

  it("parseKek rejects a wrong-length key", () => {
    expect(() => parseKek(Buffer.from("too-short").toString("base64"))).toThrow();
    expect(parseKek(randomBytes(32).toString("base64")).length).toBe(32);
  });
});
