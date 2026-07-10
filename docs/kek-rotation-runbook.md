# Runbook: Master KEK rotation

The payoff of envelope encryption (ADR-0004): rotate the master key **without re-encrypting a single
token**. Only the per-org DEKs get re-wrapped — a tiny operation — because the DEKs themselves don't
change, so the millions of token ciphertexts stay valid.

## When
- Scheduled rotation (e.g. quarterly), or immediately on suspected KEK exposure.

## Mechanism
For each org's `wrappedDek`, `rewrapDek(wrapped, oldKek, newKek)` = unwrap with the old KEK, re-wrap with
the new one. Token ciphertext is untouched (proven by the envelope rotation test).

## Steps
1. Generate `newKek` (32 random bytes, base64). Load BOTH old and new KEK into the rotation tool.
2. For each `Organization` with a `wrappedDek`: `wrappedDek = rewrapDek(wrappedDek, oldKek, newKek)`.
   This is idempotent per org and safe to resume — an org already on the new KEK will fail to unwrap with
   the old one, so track progress and skip completed orgs.
3. Flip the running KEK to `newKek` (config/KMS). Verify a sample connection decrypts.
4. Retire `oldKek` after confirming zero orgs still reference it.

## Verify
- A sampled connection's token still `open`s (decrypts) after rotation.
- No org's `wrappedDek` unwraps with the old KEK anymore.

## Do NOT
- Do **not** touch token ciphertext — it doesn't change, and rewriting millions of rows is the exact cost
  envelope encryption exists to avoid. If you find yourself re-encrypting tokens, you've misunderstood the
  design.
