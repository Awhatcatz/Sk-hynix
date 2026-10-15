const unsupportedBounds = new Set(["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern", "format"]);
// Claude's structured-output subset omits bounds; the original Zod schema still validates the response.
export function compatibleClaudeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compatibleClaudeSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !unsupportedBounds.has(key)).map(([key, item]) => [key, compatibleClaudeSchema(item)]));
}
