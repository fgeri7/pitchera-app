
export class RuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuleError";
    this.code = code;
  }
}

export function assertRule(condition, code, message) {
  if (!condition) throw new RuleError(code, message);
}
