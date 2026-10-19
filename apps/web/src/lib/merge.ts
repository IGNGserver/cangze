/** Three-way JSON merge. Arrays are atomic: never silently union permission grants or triggers. */
export interface MergeConflict {
  path: string[];
  base: unknown;
  local: unknown;
  remote: unknown;
}

export const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a).filter((k) => a[k] !== undefined);
  return (
    keys.length === Object.keys(b).filter((k) => b[k] !== undefined).length &&
    keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]))
  );
};

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function mergeJson<T>(base: T, local: T, remote: T, choices: Record<string, 'local' | 'remote'> = {}) {
  const conflicts: MergeConflict[] = [];
  const walk = (b: unknown, l: unknown, r: unknown, path: string[]): unknown => {
    if (sameJson(l, b)) return r;
    if (sameJson(r, b) || sameJson(l, r)) return l;
    if (object(b) && object(l) && object(r)) {
      return Object.fromEntries(
        [...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
          .map((key) => [key, walk(b[key], l[key], r[key], [...path, key])])
          .filter(([, value]) => value !== undefined),
      );
    }
    conflicts.push({ path, base: b, local: l, remote: r });
    return choices[JSON.stringify(path)] === 'remote' ? r : l;
  };
  return { value: walk(base, local, remote, []) as T, conflicts };
}
