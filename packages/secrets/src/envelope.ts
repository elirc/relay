import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Envelope encryption for connection tokens (S02, ADR-0004).
 *
 * The problem: we store OAuth access/refresh tokens for thousands of orgs. A database leak must NOT
 * hand the attacker usable tokens. Encrypting every token directly with one master key "works" but is
 * operationally awful — rotating that key means re-encrypting every row in the system, and the one key
 * is a single catastrophic secret.
 *
 * The envelope pattern separates two tiers:
 *   - a **DEK** (Data Encryption Key), one per org, that actually encrypts that org's tokens;
 *   - a **KEK** (Key Encryption Key), the single master secret, that only ever encrypts DEKs.
 *
 * We store each org's DEK *wrapped* (encrypted by the KEK) next to its data. To use a token: unwrap the
 * org's DEK with the KEK (held in memory / a KMS, never in the DB), then decrypt the token with the DEK.
 *
 * Payoffs:
 *   - **Rotate the KEK without re-encrypting the world** — just re-wrap each org's DEK (tiny).
 *   - **Blast radius** — compromise one org's DEK and only that org is exposed, not everyone.
 *   - **A DB leak alone is useless** — it yields wrapped DEKs + ciphertext; without the KEK, nothing
 *     decrypts.
 *
 * AES-256-GCM gives us confidentiality AND integrity (the auth tag): a tampered ciphertext fails to
 * decrypt rather than returning garbage.
 */

const ALG = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, the GCM standard
const KEY_LEN = 32; // 256-bit keys
const VERSION = "v1"; // so we can change algorithm/format later without ambiguity

/** Parse a base64 master KEK from config and assert it's exactly 32 bytes. */
export function parseKek(base64: string): Buffer {
  const kek = Buffer.from(base64, "base64");
  if (kek.length !== KEY_LEN) {
    throw new Error(`master KEK must be ${KEY_LEN} bytes (got ${kek.length}); generate 32 random bytes, base64-encoded`);
  }
  return kek;
}

/** A fresh per-org data key. */
export function generateDek(): Buffer {
  return randomBytes(KEY_LEN);
}

/** Encrypt `plaintext` bytes/utf8 with `key`, returning `version:base64(iv|tag|ciphertext)`. */
function encrypt(plaintext: Buffer, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Inverse of `encrypt`. Throws if the version is unknown or the auth tag doesn't verify (tamper). */
function decrypt(sealed: string, key: Buffer): Buffer {
  const [version, payload] = sealed.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("unrecognized ciphertext format");
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const ct = raw.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Wrap (encrypt) a DEK with the master KEK — the value we store per org. */
export function wrapDek(dek: Buffer, kek: Buffer): string {
  return encrypt(dek, kek);
}

/** Unwrap a stored DEK with the master KEK. */
export function unwrapDek(wrapped: string, kek: Buffer): Buffer {
  return decrypt(wrapped, kek);
}

/** Encrypt a token (or any secret string) with an org's DEK. */
export function seal(plaintext: string, dek: Buffer): string {
  return encrypt(Buffer.from(plaintext, "utf8"), dek);
}

/** Decrypt a token with an org's DEK. */
export function open(sealed: string, dek: Buffer): string {
  return decrypt(sealed, dek).toString("utf8");
}

/**
 * Re-wrap an org's DEK under a new KEK (key rotation). Note it touches only the wrapped DEK — the
 * org's token ciphertext is untouched, because the DEK didn't change. This is the whole point.
 */
export function rewrapDek(wrapped: string, oldKek: Buffer, newKek: Buffer): string {
  return wrapDek(unwrapDek(wrapped, oldKek), newKek);
}
