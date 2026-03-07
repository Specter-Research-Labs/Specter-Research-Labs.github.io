import type { CSSProperties } from "react";
import type { CreatureRecord } from "@/data/catalog";
import { MotionVectorGlyph } from "@/components/motion-vector-glyph";
import { SpecimenReplay } from "@/components/specimen-replay";

type SpecimenStageProps = {
  creature: CreatureRecord;
  className?: string;
  compact?: boolean;
};

export function SpecimenStage({ creature, className, compact = false }: SpecimenStageProps) {
  const [cyan, blue, violet, amber] = creature.palette;
  const compactClass = compact ? " specimen-stage-compact" : "";
  const supportsReplay = !compact && Boolean(creature.replaySrc);

  return (
    <div
      className={`specimen-stage${compactClass}${supportsReplay ? " specimen-stage-live" : ""}${className ? ` ${className}` : ""}`}
      style={
        {
          "--atlas-cyan": cyan,
          "--atlas-blue": blue,
          "--atlas-violet": violet,
          "--atlas-amber": amber,
          "--atlas-centroid-x": `${creature.telemetry.centroid.x * 100}%`,
          "--atlas-centroid-y": `${creature.telemetry.centroid.y * 100}%`,
          ...(creature.posterSrc
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(9, 5, 17, 0.12), rgba(9, 5, 17, 0.82)), url(${creature.posterSrc})`,
                backgroundPosition: "center",
                backgroundSize: "cover"
              }
            : {})
        } as CSSProperties
      }
    >
      {supportsReplay && creature.replaySrc ? <SpecimenReplay replaySrc={creature.replaySrc} /> : null}
      <div className="specimen-stage-glow specimen-glow-a" />
      <div className="specimen-stage-glow specimen-glow-b" />
      <div className="specimen-stage-core" />
      {creature.telemetry.trail.map((point, index) => (
        <span
          key={`${creature.id}-trail-${index}`}
          className="specimen-trail-dot"
          style={
            {
              "--atlas-trail-x": `${point.x * 100}%`,
              "--atlas-trail-y": `${point.y * 100}%`,
              "--atlas-trail-opacity": `${0.24 + index * 0.14}`
            } as CSSProperties
          }
        />
      ))}
      <span className="specimen-centroid" />
      <MotionVectorGlyph telemetry={creature.telemetry} className="specimen-glyph" />
    </div>
  );
}
