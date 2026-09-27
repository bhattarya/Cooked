import type { ScaleLinear } from "d3";
import s from "./viz.module.css";

/** Hairline horizontal gridlines with left-hand tick labels. */
export function YAxis({
  scale,
  x0,
  x1,
  ticks,
  format,
  grid = true,
  baseline = true,
}: {
  scale: ScaleLinear<number, number>;
  x0: number;
  x1: number;
  ticks: number[];
  format: (v: number) => string;
  grid?: boolean;
  baseline?: boolean;
}) {
  const zero = scale(0);
  const [r0, r1] = scale.range();
  const zeroInRange = zero >= Math.min(r0, r1) - 0.5 && zero <= Math.max(r0, r1) + 0.5;
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          {grid && <line x1={x0} x2={x1} y1={scale(t)} y2={scale(t)} stroke="var(--line)" shapeRendering="crispEdges" />}
          <text className={s.tick} x={x0 - 8} y={scale(t)} dy="0.34em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {baseline && zeroInRange && <line x1={x0} x2={x1} y1={zero} y2={zero} stroke="var(--line-2)" shapeRendering="crispEdges" />}
    </g>
  );
}

/** Hairline vertical gridlines with bottom tick labels. */
export function XAxis({
  scale,
  y0,
  y1,
  ticks,
  format,
  grid = true,
  baseline = true,
}: {
  scale: ScaleLinear<number, number>;
  y0: number;
  y1: number;
  ticks: number[];
  format: (v: number, i: number) => string;
  grid?: boolean;
  baseline?: boolean;
}) {
  const zero = scale(0);
  const [r0, r1] = scale.range();
  const zeroInRange = zero >= Math.min(r0, r1) - 0.5 && zero <= Math.max(r0, r1) + 0.5;
  return (
    <g aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={t}>
          {grid && <line x1={scale(t)} x2={scale(t)} y1={y0} y2={y1} stroke="var(--line)" shapeRendering="crispEdges" />}
          <text className={s.tick} x={scale(t)} y={y1 + 15} textAnchor="middle">
            {format(t, i)}
          </text>
        </g>
      ))}
      {baseline && zeroInRange && <line x1={zero} x2={zero} y1={y0} y2={y1} stroke="var(--line-2)" shapeRendering="crispEdges" />}
    </g>
  );
}
