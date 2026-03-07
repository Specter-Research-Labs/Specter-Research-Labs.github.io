import type { MotionTelemetry } from "@/data/catalog";

type MotionVectorGlyphProps = {
  telemetry: MotionTelemetry;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function MotionVectorGlyph({ telemetry, className }: MotionVectorGlyphProps) {
  const originX = 44;
  const originY = 44;
  const scale = 1800;
  const tipX = clamp(originX + telemetry.vx * scale, 16, 72);
  const tipY = clamp(originY - telemetry.vy * scale, 16, 72);
  const speedOpacity = clamp(0.35 + telemetry.speed * 48, 0.35, 1);

  return (
    <svg
      className={className}
      width="88"
      height="88"
      viewBox="0 0 88 88"
      role="img"
      aria-label={`heading ${telemetry.headingRad.toFixed(2)} radians, speed ${telemetry.speed.toFixed(4)}`}
    >
      <defs>
        <linearGradient id="atlasVectorStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7af4ff" />
          <stop offset="55%" stopColor="#725fff" />
          <stop offset="100%" stopColor="#ffbf4b" />
        </linearGradient>
      </defs>
      <circle cx={originX} cy={originY} r="4.5" fill="#fff" opacity="0.9" />
      <circle cx={originX} cy={originY} r="16" fill="none" stroke="rgba(255,255,255,0.14)" />
      <line
        x1={originX}
        y1={originY}
        x2={tipX}
        y2={tipY}
        stroke="url(#atlasVectorStroke)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ opacity: speedOpacity }}
      />
      <circle cx={tipX} cy={tipY} r="3.5" fill="#fff" opacity={speedOpacity} />
      <circle cx={tipX} cy={tipY} r="1.8" fill="#ffbf4b" opacity={speedOpacity} />
    </svg>
  );
}
