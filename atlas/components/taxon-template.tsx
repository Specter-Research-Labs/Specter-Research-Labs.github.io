import Link from "next/link";
import type { TaxonLevel } from "@/data/catalog";
import { CreatureCard } from "@/components/creature-card";
import { MetricRail } from "@/components/metric-rail";
import { Reveal } from "@/components/reveal";
import { SpecimenStage } from "@/components/specimen-stage";
import { getCreaturesForTaxon, getTaxon, getTaxonChildren, getTaxonHero } from "@/lib/catalog";

type TaxonTemplateProps = {
  level: TaxonLevel;
  slug: string;
};

export async function TaxonTemplate({ level, slug }: TaxonTemplateProps) {
  const taxon = await getTaxon(level, slug);

  if (!taxon) {
    return null;
  }

  const [hero, children, specimens] = await Promise.all([
    getTaxonHero(taxon),
    getTaxonChildren(taxon),
    getCreaturesForTaxon(slug)
  ]);

  return (
    <section className="detail-grid">
      <Reveal className="detail-copy">
        <span className="detail-kicker">{taxon.kicker}</span>
        <h1>{taxon.name}</h1>
        <p className="detail-lead">{taxon.description}</p>
        {children.length > 0 ? (
          <div className="child-pill-row">
            {children.map((child) => (
              <Link key={child.slug} href={`/${child.level}/${child.slug}`} className="atlas-pill atlas-pill-passive">
                {child.name}
              </Link>
            ))}
          </div>
        ) : null}
      </Reveal>
      <Reveal delay={0.12} className="detail-stage-column">
        <SpecimenStage creature={hero} />
        <MetricRail creature={hero} />
      </Reveal>
      <div className="specimen-grid specimen-grid-wide">
        {specimens.map((creature) => (
          <CreatureCard key={creature.id} creature={creature} />
        ))}
      </div>
    </section>
  );
}
