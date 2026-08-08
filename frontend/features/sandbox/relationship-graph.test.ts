import { describe, expect, it } from "vitest";

import {
  buildRelationshipCurve,
  curveBounds,
  type GraphGeometry,
  projectPoint,
  sampleCurve,
  toPolylinePoints,
} from "./relationship-graph";

const geometry: GraphGeometry = { width: 100, height: 100, padding: { top: 0, right: 0, bottom: 0, left: 0 } };

describe("sampleCurve", () => {
  it("returns evenly spaced samples that hit both endpoints", () => {
    const samples = sampleCurve(0, 10, 5, (x) => x * 2);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual({ x: 0, y: 0 });
    expect(samples[4]).toEqual({ x: 10, y: 20 });
    expect(samples[2]).toEqual({ x: 5, y: 10 });
  });

  it("clamps the sample count to a minimum of two", () => {
    expect(sampleCurve(0, 1, 1, (x) => x)).toHaveLength(2);
    expect(sampleCurve(0, 1, -3, (x) => x)).toHaveLength(2);
  });

  it("captures a non-linear curve's shape", () => {
    const samples = sampleCurve(0, 4, 5, (x) => 0.5 * x * x);
    expect(samples.map((sample) => sample.y)).toEqual([0, 0.5, 2, 4.5, 8]);
  });

  it("replaces non-finite outputs with zero", () => {
    const samples = sampleCurve(0, 2, 3, (x) => (x === 2 ? Number.NaN : x));
    expect(samples[2].y).toBe(0);
  });
});

describe("curveBounds", () => {
  it("always includes a zero baseline on the y-axis", () => {
    const bounds = curveBounds([
      { x: 1, y: 5 },
      { x: 3, y: 20 },
    ]);
    expect(bounds).toEqual({ xMin: 1, xMax: 3, yMin: 0, yMax: 20 });
  });

  it("expands to include extra points such as prior runs", () => {
    const bounds = curveBounds([{ x: 0, y: 2 }], [{ x: 10, y: 50 }]);
    expect(bounds.xMax).toBe(10);
    expect(bounds.yMax).toBe(50);
  });

  it("pads a degenerate flat curve so projection stays finite", () => {
    const bounds = curveBounds([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(bounds.yMax).toBeGreaterThan(bounds.yMin);
  });
});

describe("projectPoint", () => {
  it("maps data space into the padded pixel box with an inverted y-axis", () => {
    const bounds = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
    expect(projectPoint({ x: 0, y: 0 }, bounds, geometry)).toEqual({ x: 0, y: 100 });
    expect(projectPoint({ x: 10, y: 10 }, bounds, geometry)).toEqual({ x: 100, y: 0 });
    expect(projectPoint({ x: 5, y: 5 }, bounds, geometry)).toEqual({ x: 50, y: 50 });
  });
});

describe("toPolylinePoints", () => {
  it("projects samples into a space-separated SVG points string", () => {
    const samples = sampleCurve(0, 10, 3, (x) => x);
    const bounds = curveBounds(samples);
    const points = toPolylinePoints(samples, bounds, geometry);
    // x sweeps left→right; y is inverted (larger value → smaller pixel y).
    expect(points).toBe("0,100 50,50 100,0");
  });
});

describe("buildRelationshipCurve", () => {
  it("assembles curve, operating point, and projected prior runs", () => {
    const curve = buildRelationshipCurve({
      min: 0,
      max: 10,
      samples: 3,
      compute: (x) => x,
      operating: { x: 5, y: 5 },
      runs: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      runIds: [7, 8],
      geometry,
    });
    expect(curve.polyline).toBe("0,100 50,50 100,0");
    expect(curve.operating).toEqual({ x: 50, y: 50 });
    expect(curve.runPoints).toEqual([
      { id: 7, point: { x: 0, y: 100 } },
      { id: 8, point: { x: 100, y: 0 } },
    ]);
    expect(curve.areaPath.startsWith("M 0,100")).toBe(true);
    expect(curve.areaPath.endsWith("Z")).toBe(true);
  });
});
