// Objects are diffed recursively. Entity arrays are keyed by stable IDs so reordering
// stages never appears as an edit to a different entity.
export type Changes = Record<string, { anterior: unknown; novo: unknown }>;
export function changedFields(
  before: unknown,
  after: unknown,
  path = "",
): Changes {
  const changes: Changes = {};
  const visit = (a: unknown, b: unknown, key: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      Array.isArray(a) &&
      Array.isArray(b) &&
      [...a, ...b].every((v) => v && typeof v === "object" && "id" in v)
    ) {
      const old = new Map(a.map((v) => [String(v.id), v]));
      const next = new Map(b.map((v) => [String(v.id), v]));
      for (const id of new Set([...old.keys(), ...next.keys()]))
        visit(old.get(id), next.get(id), key + "[" + id + "]");
    } else if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const prior = a as Record<string, unknown>,
        value = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(prior), ...Object.keys(value)])) {
        if (k === "__revision") continue;
        visit(prior[k], value[k], key ? key + "." + k : k);
      }
    } else changes[key] = { anterior: a ?? null, novo: b ?? null };
  };
  visit(before, after, path);
  return changes;
}
