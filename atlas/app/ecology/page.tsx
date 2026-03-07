import type { CSSProperties } from "react";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { getCatalog } from "@/lib/catalog";

export default async function EcologyPage() {
  const { creatures } = await getCatalog();

  return (
    <div className="atlas-stack">
      <Reveal className="detail-copy">
        <span className="detail-kicker">Ecology</span>
        <h1>Morphospace explorer</h1>
        <p className="detail-lead">
          The atlas scaffold renders ecology as a luminous field rather than a dense dashboard. Each point is a
          specimen entrypoint.
        </p>
      </Reveal>

      <section className="ecology-map">
        <div className="ecology-map-grid" aria-hidden="true" />
        {creatures.map((creature, index) => (
          <Link
            key={creature.id}
            href={`/creature/${creature.slug}`}
            className="ecology-node"
            style={
              {
                "--node-x": `${20 + index * 26}%`,
                "--node-y": `${60 - creature.telemetry.speed * 1800}%`,
                "--node-color": creature.palette[2]
              } as CSSProperties
            }
          >
            <span>{creature.name}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
