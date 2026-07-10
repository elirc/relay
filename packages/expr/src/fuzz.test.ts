import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { render } from "./render";

/**
 * The expression fuzz corpus (S13, flaw #1). This is a PERMANENT CI adversary: a regression here is a
 * reopened secret-exfiltration vulnerability. The exploit it pins: user *data* (a vendor row) that
 * contains `{{…}}` must never be re-evaluated as a template.
 */
describe("expr fuzz — resolved values are inert (flaw #1 fix)", () => {
  it("EXPLOIT: a step output containing {{connection.token}} is NOT re-expanded into the secret", () => {
    const scope = { steps: [{ output: { note: "{{trigger.token}}" } }], trigger: { token: "SECRET_TOKEN" } };
    // whole-field ref: the value is returned literally, not re-evaluated
    expect(render("{{steps.0.output.note}}", scope)).toBe("{{trigger.token}}");
    // mixed text: the literal appears; the secret does NOT
    const mixed = render("Note: {{steps.0.output.note}}", scope);
    expect(String(mixed)).not.toContain("SECRET_TOKEN");
    expect(mixed).toBe("Note: {{trigger.token}}");
  });

  it("property: a resolved value is spliced in VERBATIM, whatever it contains", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (secret, payload) => {
        const scope = { steps: [{ output: { v: payload } }], trigger: { secret } };
        // No matter what `payload` is (including "{{trigger.secret}}"), the output is exactly the payload
        // spliced into the template — never a second round of evaluation.
        return render("x {{steps.0.output.v}} y", scope) === `x ${payload} y`;
      }),
    );
  });
});
