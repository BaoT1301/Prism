/**
 * Minimal runtime guards for the trusted-but-not-guaranteed backend boundary.
 * These do NOT deeply validate every field; they only ensure the *shape* the
 * UI relies on (arrays it will `.map`, numbers it will render) can never crash
 * the render. Anything malformed degrades to a safe empty value.
 */

export type CollectionShape<T> = { items: T[]; total: number };

/** Guarantees a `{ items, total }` collection so callers can safely `.map`. */
export function ensureCollectionShape<T>(value: { items?: T[]; total?: number } | null | undefined): CollectionShape<T> {
  const items = Array.isArray(value?.items) ? (value?.items as T[]) : [];
  const total = typeof value?.total === "number" && Number.isFinite(value.total) ? value.total : items.length;
  return { items, total };
}

/** Guarantees the `items` array of a collection-shaped payload. */
export function ensureItems<T>(value: { items?: T[] } | null | undefined): T[] {
  return Array.isArray(value?.items) ? (value?.items as T[]) : [];
}

/**
 * Guarantees a plain array so callers can safely `.map`, regardless of backend
 * drift. Unlike `ensureItems`, this guards a value that is *itself* the array
 * (e.g. a bare-array endpoint or a nested `choices` field), not a `{ items }`
 * wrapper. Anything non-array degrades to `[]`.
 */
export function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Coerces a numeric-looking value to a finite number, falling back otherwise.
 * Only numbers and non-empty numeric strings are accepted — `null`, `undefined`,
 * `""`, and booleans return the fallback (rather than JS's surprising `Number(null) === 0`).
 */
export function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
