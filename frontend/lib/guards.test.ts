import { describe, expect, it } from "vitest";

import { ensureCollectionShape, ensureItems, toFiniteNumber } from "./guards";

describe("ensureCollectionShape", () => {
  it("never yields a non-array items field", () => {
    expect(ensureCollectionShape(null)).toEqual({ items: [], total: 0 });
    expect(ensureCollectionShape(undefined)).toEqual({ items: [], total: 0 });
    expect(ensureCollectionShape({ items: null as unknown as number[] })).toEqual({ items: [], total: 0 });
  });

  it("defaults total to the item count and honours a valid total", () => {
    expect(ensureCollectionShape({ items: [1, 2] })).toEqual({ items: [1, 2], total: 2 });
    expect(ensureCollectionShape({ items: [1], total: 9 })).toEqual({ items: [1], total: 9 });
    expect(ensureCollectionShape({ items: [1], total: Number.NaN }).total).toBe(1);
  });
});

describe("ensureItems", () => {
  it("returns a safe array for any shape", () => {
    expect(ensureItems(null)).toEqual([]);
    expect(ensureItems({})).toEqual([]);
    expect(ensureItems({ items: [1, 2] })).toEqual([1, 2]);
  });
});

describe("toFiniteNumber", () => {
  it("returns the number when finite, otherwise the fallback", () => {
    expect(toFiniteNumber("3", 0)).toBe(3);
    expect(toFiniteNumber(2, 0)).toBe(2);
    expect(toFiniteNumber(Number.NaN, 5)).toBe(5);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY, 5)).toBe(5);
    expect(toFiniteNumber(null, 5)).toBe(5);
    expect(toFiniteNumber("nope", 5)).toBe(5);
  });
});
