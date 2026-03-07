import { notFound } from "next/navigation";
import { CreatureCard } from "@/components/creature-card";
import { Reveal } from "@/components/reveal";
import { getCatalog, getRun, getRunCreatures } from "@/lib/catalog";

type RunPageProps = {
  params: Promise<{ runId: string }>;
};

export async function generateStaticParams() {
  const catalog = await getCatalog();
  return catalog.runs.map((run) => ({ runId: run.id }));
}

export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  const run = await getRun(runId);

  if (!run) {
    notFound();
  }

  const creatures = await getRunCreatures(runId);

  return (
    <div className="atlas-stack">
      <Reveal className="detail-copy">
        <span className="detail-kicker">Run</span>
        <h1>{run.title}</h1>
        <p className="detail-lead">{run.narrative}</p>
        <dl className="metadata-grid">
          <div>
            <dt>Date</dt>
            <dd>{run.date}</dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd>{run.host}</dd>
          </div>
          <div>
            <dt>Specimens</dt>
            <dd>{creatures.length}</dd>
          </div>
        </dl>
      </Reveal>
      <section className="specimen-grid specimen-grid-wide">
        {creatures.map((creature) => (
          <CreatureCard key={creature.id} creature={creature} />
        ))}
      </section>
    </div>
  );
}
