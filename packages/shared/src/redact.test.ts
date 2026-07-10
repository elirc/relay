import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  const token = "at_9f8e7d6c5b4a3210";

  it("masks a token planted anywhere in a nested payload", () => {
    const payload = {
      headers: { authorization: `Bearer ${token}` },
      note: "sent ok",
      trail: [{ used: token }],
    };
    const out = redactSecrets(payload, [token]);
    expect(JSON.stringify(out)).not.toContain(token);
    expect(out.note).toBe("sent ok"); // innocuous data untouched
    expect(out.headers.authorization).toContain("«redacted»");
    expect((out.trail[0] as { used: string }).used).toBe("«redacted»");
  });

  it("ignores empty/short secrets so it can't mask innocuous text", () => {
    const payload = { a: "hello world" };
    expect(redactSecrets(payload, ["", "ab"])).toEqual(payload);
  });

  it("returns the value unchanged when there are no secrets", () => {
    const payload = { a: 1, b: [2, 3] };
    expect(redactSecrets(payload, [])).toEqual(payload);
  });
});
