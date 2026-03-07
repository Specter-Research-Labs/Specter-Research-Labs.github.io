import Link from "next/link";
import { HeroWall } from "@/components/hero-wall";
import { Reveal } from "@/components/reveal";
import { getCatalog, getTaxa } from "@/lib/catalog";

export default async function AtlasLandingPage() {
  const [catalog, families] = await Promise.all([getCatalog(), getTaxa("family")]);
  const { headline, subheadline } = catalog;
  const firstFamily = families[0]?.slug;

  return (
    <div className="atlas-stack">
      <section className="landing-hero">
        <Reveal className="landing-copy">
          <span className="detail-kicker">Collection</span>
          <h1>{headline}</h1>
          <p className="detail-lead">{subheadline}</p>
          <div className="cta-row">
            <Link href="/creatures" className="atlas-pill atlas-pill-strong">
              Browse collection
            </Link>
            <Link href="/ecology" className="atlas-pill">
              Browse ecology
            </Link>
            <Link href={firstFamily ? `/family/${firstFamily}` : "/ecology"} className="atlas-pill atlas-pill-passive">
              Enter taxonomy
            </Link>
          </div>
        </Reveal>
        <HeroWall />
      </section>

      <section className="summary-band">
        <div>
          <span>Specimens</span>
          <strong>{catalog.creatures.length}</strong>
        </div>
        <div>
          <span>Families</span>
          <strong>{families.length}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>Filmic + telemetry</strong>
        </div>
      </section>

      <section className="taxon-showcase">
        {families.map((family) => (
          <article key={family.slug} className="taxon-card">
            <span className="detail-kicker">{family.kicker}</span>
            <h2>{family.name}</h2>
            <p>{family.description}</p>
            <Link href={`/family/${family.slug}`} className="atlas-text-link">
              Open family
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
