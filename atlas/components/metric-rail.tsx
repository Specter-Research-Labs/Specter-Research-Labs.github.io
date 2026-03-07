import type { CSSProperties } from "react";
import type { CreatureRecord } from "@/data/catalog";

type MetricRailProps = {
  creature: CreatureRecord;
};

export function MetricRail({ creature }: MetricRailProps) {
  return (
    <div className="metric-rail">
      {creature.metrics.map((metric) => (
        <div key={`${creature.id}-${metric.label}`} className="metric-bar">
          <div className="metric-bar-head">
            <span>{metric.label}</span>
            <span>{metric.value.toFixed(2)}</span>
          </div>
          <div className="metric-bar-track">
            <div
              className="metric-bar-fill"
              style={
                {
                  "--metric-fill": metric.color,
                  "--metric-value": `${metric.value * 100}%`
                } as CSSProperties
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
