/**
 * Pure geometry for the live relationship graph. Nothing here touches React or
 * the DOM: it turns a formula + a swept range into sampled data points and SVG
 * pixel coordinates, so every step can be unit-tested in isolation.
 */

export interface CurveSample {
  /** Value of the swept input variable. */
  x: number;
  /** Formula output at that swept value. */
  y: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphGeometry {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface PixelPoint {
  x: number;
  y: number;
}

/** A recorded "Run" — a frozen snapshot compared against later on the graph. */
export interface RunSnapshot {
  id: number;
  /** All input values at the moment the run was executed. */
  values: Record<string, number>;
  /** Output produced by the formula for those values. */
  result: number;
  /** Which variable the graph was sweeping when the run was taken. */
  sweptId: string;
}

export interface RelationshipCurve {
  samples: CurveSample[];
  bounds: Bounds;
  geometry: GraphGeometry;
  /** "x,y x,y …" string ready for an SVG <polyline points=…>. */
  polyline: string;
  /** Same curve closed down to the baseline, for a soft area fill. */
  areaPath: string;
  /** The live operating point, already projected to pixels. */
  operating: PixelPoint;
  /** Prior runs projected to pixels (only those sharing the swept axis). */
  runPoints: { id: number; point: PixelPoint }[];
}

/**
 * Samples `compute(x)` at `samples` evenly-spaced points across [min, max].
 * Non-finite outputs collapse to 0 so a stray value can never break projection.
 */
export function sampleCurve(min: number, max: number, samples: number, compute: (x: number) => number): CurveSample[] {
  const count = Math.max(2, Math.floor(samples));
  const span = max - min;
  const out: CurveSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const x = min + span * t;
    const y = compute(x);
    out.push({ x, y: Number.isFinite(y) ? y : 0 });
  }
  return out;
}

/**
 * Bounds spanning the sampled curve plus any extra points (operating point,
 * prior runs). The y-axis always includes a zero baseline so bars read honestly,
 * and a degenerate range is padded so projection never divides by zero.
 */
export function curveBounds(samples: CurveSample[], extra: CurveSample[] = []): Bounds {
  const points = [...samples, ...extra];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  let yMax = Math.max(0, ...ys);
  if (yMax <= yMin) yMax = yMin + 1;
  return { xMin, xMax, yMin, yMax };
}

/** Projects a single data point into SVG pixel space within the geometry. */
export function projectPoint(point: CurveSample, bounds: Bounds, geometry: GraphGeometry): PixelPoint {
  const { width, height, padding } = geometry;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xRange = bounds.xMax - bounds.xMin;
  const yRange = bounds.yMax - bounds.yMin;
  const xFraction = xRange === 0 ? 0 : (point.x - bounds.xMin) / xRange;
  const yFraction = yRange === 0 ? 0 : (point.y - bounds.yMin) / yRange;
  return {
    x: padding.left + xFraction * innerWidth,
    y: padding.top + (1 - yFraction) * innerHeight,
  };
}

/**
 * The core "values → polyline points" helper: projects every sample and joins
 * them into the space-separated coordinate string an SVG <polyline> expects.
 */
export function toPolylinePoints(samples: CurveSample[], bounds: Bounds, geometry: GraphGeometry): string {
  return samples
    .map((sample) => {
      const { x, y } = projectPoint(sample, bounds, geometry);
      return `${round(x)},${round(y)}`;
    })
    .join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Assembles everything the graph component needs in one pure call. */
export function buildRelationshipCurve(params: {
  min: number;
  max: number;
  samples: number;
  compute: (x: number) => number;
  operating: CurveSample;
  runs: CurveSample[];
  runIds?: number[];
  geometry: GraphGeometry;
}): RelationshipCurve {
  const { min, max, samples, compute, operating, runs, geometry } = params;
  const runSamples = runs.map((run) => ({ x: run.x, y: run.y }));
  const curve = sampleCurve(min, max, samples, compute);
  const bounds = curveBounds(curve, [operating, ...runSamples]);
  const projected = curve.map((sample) => projectPoint(sample, bounds, geometry));
  const polyline = projected.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
  const baselineY = round(projectPoint({ x: bounds.xMin, y: Math.max(bounds.yMin, 0) }, bounds, geometry).y);
  const first = projected[0];
  const last = projected[projected.length - 1];
  const lineTos = projected.map((point) => `L ${round(point.x)},${round(point.y)}`).join(" ");
  const areaPath = `M ${round(first.x)},${baselineY} ${lineTos} L ${round(last.x)},${baselineY} Z`;
  const runIds = params.runIds ?? runs.map((_, index) => index);
  return {
    samples: curve,
    bounds,
    geometry,
    polyline,
    areaPath,
    operating: projectPoint(operating, bounds, geometry),
    runPoints: runSamples.map((sample, index) => ({ id: runIds[index] ?? index, point: projectPoint(sample, bounds, geometry) })),
  };
}
