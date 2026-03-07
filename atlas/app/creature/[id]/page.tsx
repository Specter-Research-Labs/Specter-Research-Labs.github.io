import { notFound } from "next/navigation";
import { AnatomyGrid } from "@/components/anatomy-grid";
import { CreatureCard } from "@/components/creature-card";
import { MetricRail } from "@/components/metric-rail";
import { Reveal } from "@/components/reveal";
import { SpecimenStage } from "@/components/specimen-stage";
import { getCatalog, getCreature, getRelatedCreatures } from "@/lib/catalog";

type CreaturePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateStaticParams() {
  const catalog = await getCatalog();
  return catalog.creatures.map((creature) => ({ id: creature.slug }));
}

export default async function CreaturePage({ params }: CreaturePageProps) {
  const { id } = await params;
  const creature = await getCreature(id);

  if (!creature) {
    notFound();
  }

  const related = await getRelatedCreatures(creature);

  return (
    <div className="atlas-stack">
      <section className="detail-grid">
        <Reveal className="detail-copy">
          <span className="detail-kicker">{creature.epithet}</span>
          <h1>{creature.name}</h1>
          <p className="detail-lead">{creature.tagline}</p>
          <dl className="metadata-grid">
            <div>
              <dt>Run</dt>
              <dd>{creature.runId}</dd>
            </div>
            <div>
              <dt>Heading</dt>
              <dd>{creature.telemetry.headingRad.toFixed(3)} rad</dd>
            </div>
            <div>
              <dt>Velocity</dt>
              <dd>
                {creature.telemetry.vx.toFixed(4)}, {creature.telemetry.vy.toFixed(4)}
              </dd>
            </div>
          </dl>
        </Reveal>
        <Reveal delay={0.12} className="detail-stage-column">
          <SpecimenStage creature={creature} />
          <MetricRail creature={creature} />
        </Reveal>
      </section>

      <AnatomyGrid creature={creature} />

      <section className="specimen-grid">
        {related.map((candidate) => (
          <CreatureCard key={candidate.id} creature={candidate} />
        ))}
      </section>
    </div>
  );
}
