import Link from "next/link";
import { CreatureCard } from "@/components/creature-card";
import { Reveal } from "@/components/reveal";
import { getCatalog } from "@/lib/catalog";

type BrowsePageProps = {
  searchParams: Promise<{
    q?: string;
    family?: string;
    run?: string;
    sort?: string;
  }>;
};

type BrowseSort = "score" | "name" | "speed";

export default async function CreatureBrowsePage({ searchParams }: BrowsePageProps) {
  const [{ q, family, run, sort }, catalog] = await Promise.all([searchParams, getCatalog()]);
  const query = q?.trim() ?? "";
  const selectedFamily = family?.trim() ?? "";
  const selectedRun = run?.trim() ?? "";
  const selectedSort = asBrowseSort(sort);

  const familyOptions = catalog.taxa
    .filter((taxon) => taxon.level === "family")
    .map((taxon) => ({ slug: taxon.slug, name: taxon.name }));
  const runOptions = catalog.runs.map((entry) => ({ id: entry.id, title: entry.title }));

  const filtered = catalog.creatures
    .filter((creature) => matchesQuery(creature, query))
    .filter((creature) => (selectedFamily ? creature.familySlug === selectedFamily : true))
    .filter((creature) => (selectedRun ? creature.runId === selectedRun : true))
    .sort((left, right) => compareCreatures(left, right, selectedSort));

  return (
    <div className="atlas-stack">
      <Reveal className="detail-copy">
        <span className="detail-kicker">Collection</span>
        <h1>Browse specimens</h1>
        <p className="detail-lead">
          Search the published corpus directly, then jump into taxonomy, ecology, or the full cinematic creature page.
        </p>
      </Reveal>

      <section className="browse-panel">
        <form className="browse-toolbar" action="/creatures">
          <label className="browse-field browse-field-wide">
            Query
            <input type="search" name="q" defaultValue={query} placeholder="Name, lineage, or behavior" />
          </label>
          <label className="browse-field">
            Family
            <select name="family" defaultValue={selectedFamily}>
              <option value="">All families</option>
              {familyOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="browse-field">
            Run
            <select name="run" defaultValue={selectedRun}>
              <option value="">All runs</option>
              {runOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          <label className="browse-field">
            Sort
            <select name="sort" defaultValue={selectedSort}>
              <option value="score">Score</option>
              <option value="name">Name</option>
              <option value="speed">Speed</option>
            </select>
          </label>
          <div className="browse-actions">
            <button type="submit" className="atlas-pill atlas-pill-strong">
              Apply
            </button>
            <Link href="/creatures" className="atlas-pill atlas-pill-passive">
              Reset
            </Link>
          </div>
        </form>

        <div className="browse-summary">
          <div>
            <span>Matches</span>
            <strong>{filtered.length}</strong>
          </div>
          <div>
            <span>Families</span>
            <strong>{new Set(filtered.map((creature) => creature.familySlug)).size}</strong>
          </div>
          <div>
            <span>Runs</span>
            <strong>{new Set(filtered.map((creature) => creature.runId)).size}</strong>
          </div>
        </div>
      </section>

      {filtered.length > 0 ? (
        <section className="specimen-grid">
          {filtered.map((creature) => (
            <CreatureCard key={creature.id} creature={creature} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <span className="section-kicker">No matches</span>
          <h2>Nothing matches this slice of the corpus.</h2>
          <p>Relax the query or clear the family and run filters to reopen the full atlas collection.</p>
        </section>
      )}
    </div>
  );
}

function asBrowseSort(value?: string): BrowseSort {
  return value === "name" || value === "speed" ? value : "score";
}

function matchesQuery(
  creature: {
    name: string;
    epithet: string;
    tagline: string;
    familySlug: string;
    genusSlug: string;
    speciesSlug: string;
    runId: string;
  },
  query: string
) {
  if (!query) {
    return true;
  }
  const haystack = [
    creature.name,
    creature.epithet,
    creature.tagline,
    creature.familySlug,
    creature.genusSlug,
    creature.speciesSlug,
    creature.runId
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function compareCreatures(
  left: {
    name: string;
    score: number;
    telemetry: { speed: number };
  },
  right: {
    name: string;
    score: number;
    telemetry: { speed: number };
  },
  sort: BrowseSort
) {
  if (sort === "name") {
    return left.name.localeCompare(right.name);
  }
  if (sort === "speed") {
    return right.telemetry.speed - left.telemetry.speed || right.score - left.score;
  }
  return right.score - left.score || left.name.localeCompare(right.name);
}
