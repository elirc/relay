/** Grammar violation — the template contains something the closed path grammar forbids. */
export class ExprParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprParseError";
  }
}

/** A reference pointed at something that isn't there when the template was rendered. */
export class ExprRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprRenderError";
  }
}
