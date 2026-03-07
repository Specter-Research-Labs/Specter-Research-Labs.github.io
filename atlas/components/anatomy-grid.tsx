import type { CSSProperties } from "react";
import type { CreatureRecord } from "@/data/catalog";

type AnatomyGridProps = {
  creature: CreatureRecord;
};

export function AnatomyGrid({ creature }: AnatomyGridProps) {
  return (
    <section className="anatomy-grid" aria-labelledby={`${creature.id}-anatomy`}>
      <div className="section-heading">
        <span className="section-kicker">Anatomy mode</span>
        <h2 id={`${creature.id}-anatomy`}>Field, delta, neighborhood, kernel</h2>
      </div>
      <div className="anatomy-grid-panels">
        {creature.anatomyPanels.map((panel) => (
          <article
            key={`${creature.id}-${panel.key}`}
            className="anatomy-panel"
            style={
              {
                "--atlas-cyan": panel.palette[0],
                "--atlas-blue": panel.palette[1],
                "--atlas-violet": panel.palette[2],
                "--atlas-amber": panel.palette[3]
              } as CSSProperties
            }
          >
            <div className="anatomy-panel-stage">
              {panel.imageSrc ? (
                <>
                  <img className="anatomy-panel-image" src={panel.imageSrc} alt={`${creature.name} ${panel.label}`} />
                  <div className="anatomy-panel-image-veil" aria-hidden="true" />
                </>
              ) : (
                <>
                  <div className="specimen-stage-glow specimen-glow-a" />
                  <div className="specimen-stage-glow specimen-glow-b" />
                  <div className="specimen-stage-core" />
                </>
              )}
            </div>
            <div className="anatomy-panel-copy">
              <span>{panel.label}</span>
              <p>{panel.caption}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
