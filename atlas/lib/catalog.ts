import "server-only";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Row } from "@libsql/client";
import { cache } from "react";
import {
  catalog as mockCatalog,
  type CatalogRecord,
  type CreatureRecord,
  type MotionTelemetry,
  type RunRecord,
  type TaxonLevel,
  type TaxonRecord
} from "@/data/catalog";

const ATLAS_BASE_PATH = "/atlas";
const LENIA_PALETTE: [string, string, string, string] = ["#7cf5ff", "#4f83ff", "#bf37ff", "#ffcc45"];
let didWarnAutoDetectedSQLite = false;

type AnatomyPanelKey = "field" | "delta" | "neighbor" | "kernel";

type PublishedCatalog = {
  revision: {
    id: string;
    createdAt: string;
    sourceDb: string;
    creatureCount: number;
    taxonCount: number;
  };
  taxa: PublishedTaxon[];
  creatures: PublishedCreature[];
  runs: PublishedRun[];
};

type PublishedTaxon = {
  id: string;
  rank: TaxonLevel;
  slug: string;
  label: string;
  parentId?: string | null;
  creatureCount: number;
  heroCreatureId?: string | null;
  averageScore?: number | null;
};

type PublishedMetrics = {
  massMean: number;
  gyration: number;
  centerVelocity: number;
  velocityX: number;
  velocityY: number;
  headingRad: number;
  complexityMean?: number | null;
  pathLength: number;
  displacement: number;
};

type PublishedTelemetrySummary = {
  centroid: { x: number; y: number };
  trail: Array<{ x: number; y: number }>;
};

type PublishedMedia = {
  posterPath?: string | null;
  replayPath?: string | null;
  width?: number | null;
  height?: number | null;
  anatomy?: (Partial<Record<AnatomyPanelKey, string>> & {
    fieldPath?: string | null;
    deltaPath?: string | null;
    neighborPath?: string | null;
    kernelPath?: string | null;
  }) | null;
  fieldPath?: string | null;
  deltaPath?: string | null;
  neighborPath?: string | null;
  kernelPath?: string | null;
};

type PublishedCreature = {
  id: string;
  slug: string;
  name: string;
  runId: string;
  campaignId?: string | null;
  recordedAt: string;
  score?: number | null;
  isStable: boolean;
  familyId?: string | null;
  genusId?: string | null;
  speciesId?: string | null;
  metrics: PublishedMetrics;
  telemetry?: PublishedTelemetrySummary | null;
  media?: PublishedMedia | null;
  provenance: {
    runName: string;
    hostId?: string | null;
    outputRoot?: string | null;
    runDir?: string | null;
    baseConfigPath?: string | null;
    searchConfigPath?: string | null;
  };
};

type PublishedRun = {
  id: string;
  name: string;
  hostId?: string | null;
  creatureCount: number;
  slug: string;
  outputRoot?: string | null;
  runDir?: string | null;
};

type Range = {
  min: number;
  max: number;
};

const loadCachedCatalog = cache(async (): Promise<CatalogRecord> => {
  const databaseUrl = trimEnv("ATLAS_DATABASE_URL");
  if (databaseUrl) {
    const catalog = await loadPublishedCatalogFromDatabase({
      url: databaseUrl,
      authToken: trimEnv("ATLAS_AUTH_TOKEN") ?? undefined
    });
    return mapPublishedCatalog(catalog);
  }

  const jsonPath = firstExistingPath([
    path.join(process.cwd(), "public", "published", "catalog.json"),
    path.join(process.cwd(), "data", "published", "catalog.json")
  ]);
  if (jsonPath) {
    const raw = await fs.promises.readFile(jsonPath, "utf8");
    return mapPublishedCatalog(JSON.parse(raw) as PublishedCatalog);
  }

  const sqlitePath = firstExistingPath([
    path.join(process.cwd(), "public", "published", "catalog.sqlite"),
    path.join(process.cwd(), "data", "published", "catalog.sqlite")
  ]);
  if (sqlitePath) {
    try {
      const catalog = await loadPublishedCatalogFromDatabase({
        url: pathToFileURL(sqlitePath).toString()
      });
      return mapPublishedCatalog(catalog);
    } catch (error) {
      if (!didWarnAutoDetectedSQLite) {
        didWarnAutoDetectedSQLite = true;
        console.warn(`Skipping local atlas SQLite catalog at ${sqlitePath}:`, error);
      }
    }
  }

  return mockCatalog;
});

export async function getCatalog(): Promise<CatalogRecord> {
  return loadCachedCatalog();
}

export async function getFeaturedCreatures(): Promise<CreatureRecord[]> {
  const catalog = await loadCachedCatalog();
  return catalog.featuredCreatureIds.map((id) => requireById(catalog.creatures, id));
}

export async function getCreature(idOrSlug: string): Promise<CreatureRecord | undefined> {
  const catalog = await loadCachedCatalog();
  return catalog.creatures.find((creature) => creature.id === idOrSlug || creature.slug === idOrSlug);
}

export async function getCreaturesForTaxon(slug: string): Promise<CreatureRecord[]> {
  const catalog = await loadCachedCatalog();
  const taxon = requireBySlug(catalog.taxa, slug);
  return taxon.specimenIds.map((id) => requireById(catalog.creatures, id));
}

export async function getTaxon(level: TaxonLevel, slug: string): Promise<TaxonRecord | undefined> {
  const catalog = await loadCachedCatalog();
  return catalog.taxa.find((taxon) => taxon.level === level && taxon.slug === slug);
}

export async function getTaxonChildren(taxon: TaxonRecord): Promise<TaxonRecord[]> {
  const catalog = await loadCachedCatalog();
  return taxon.childSlugs.map((slug) => requireBySlug(catalog.taxa, slug));
}

export async function getRelatedCreatures(creature: CreatureRecord): Promise<CreatureRecord[]> {
  const catalog = await loadCachedCatalog();
  return catalog.creatures
    .filter((candidate) => candidate.id !== creature.id && candidate.familySlug === creature.familySlug)
    .slice(0, 6);
}

export async function getRun(runId: string): Promise<RunRecord | undefined> {
  const catalog = await loadCachedCatalog();
  return catalog.runs.find((run) => run.id === runId);
}

export async function getRunCreatures(runId: string): Promise<CreatureRecord[]> {
  const catalog = await loadCachedCatalog();
  return catalog.creatures.filter((creature) => creature.runId === runId);
}

export async function getTaxa(level: TaxonLevel): Promise<TaxonRecord[]> {
  const catalog = await loadCachedCatalog();
  return catalog.taxa.filter((taxon) => taxon.level === level);
}

export async function getTaxonHero(taxon: TaxonRecord): Promise<CreatureRecord> {
  const catalog = await loadCachedCatalog();
  return requireById(catalog.creatures, taxon.heroCreatureId);
}

async function loadPublishedCatalogFromDatabase(config: {
  url: string;
  authToken?: string;
}): Promise<PublishedCatalog> {
  const client = createClient({
    url: config.url,
    authToken: config.authToken
  });

  try {
    const [revisionResult, taxaResult, creaturesResult, runsResult] = await Promise.all([
      client.execute(
        "SELECT id, created_at AS createdAt, source_db AS sourceDb, creature_count AS creatureCount, taxon_count AS taxonCount FROM catalog_revision LIMIT 1"
      ),
      client.execute(
        "SELECT id, rank, slug, label, parent_id AS parentId, creature_count AS creatureCount, hero_creature_id AS heroCreatureId, average_score AS averageScore FROM taxa ORDER BY rank ASC, label ASC"
      ),
      client.execute(
        "SELECT id, slug, name, run_id AS runId, campaign_id AS campaignId, recorded_at AS recordedAt, score, is_stable AS isStable, family_id AS familyId, genus_id AS genusId, species_id AS speciesId, metrics_json AS metricsJson, telemetry_json AS telemetryJson, media_json AS mediaJson, provenance_json AS provenanceJson FROM creatures ORDER BY COALESCE(score, -1.0e30) DESC, id ASC"
      ),
      client.execute(
        "SELECT id, name, host_id AS hostId, creature_count AS creatureCount, slug, output_root AS outputRoot, run_dir AS runDir FROM runs ORDER BY id ASC"
      )
    ]);

    return {
      revision: parseRevisionRow(revisionResult.rows[0]),
      taxa: taxaResult.rows.map(parseTaxonRow),
      creatures: creaturesResult.rows.map(parseCreatureRow),
      runs: runsResult.rows.map(parseRunRow)
    };
  } finally {
    client.close();
  }
}

function parseRevisionRow(row: Row | undefined): PublishedCatalog["revision"] {
  if (!row) {
    throw new Error("Missing catalog_revision row.");
  }
  return {
    id: requiredText(row, "id"),
    createdAt: requiredText(row, "createdAt"),
    sourceDb: requiredText(row, "sourceDb"),
    creatureCount: requiredNumber(row, "creatureCount"),
    taxonCount: requiredNumber(row, "taxonCount")
  };
}

function parseTaxonRow(row: Row): PublishedTaxon {
  return {
    id: requiredText(row, "id"),
    rank: requiredTaxonLevel(row, "rank"),
    slug: requiredText(row, "slug"),
    label: requiredText(row, "label"),
    parentId: optionalText(row, "parentId"),
    creatureCount: requiredNumber(row, "creatureCount"),
    heroCreatureId: optionalText(row, "heroCreatureId"),
    averageScore: optionalNumber(row, "averageScore")
  };
}

function parseCreatureRow(row: Row): PublishedCreature {
  return {
    id: requiredText(row, "id"),
    slug: requiredText(row, "slug"),
    name: requiredText(row, "name"),
    runId: requiredText(row, "runId"),
    campaignId: optionalText(row, "campaignId"),
    recordedAt: requiredText(row, "recordedAt"),
    score: optionalNumber(row, "score"),
    isStable: requiredBoolean(row, "isStable"),
    familyId: optionalText(row, "familyId"),
    genusId: optionalText(row, "genusId"),
    speciesId: optionalText(row, "speciesId"),
    metrics: requiredJson<PublishedMetrics>(row, "metricsJson"),
    telemetry: optionalJson<PublishedTelemetrySummary>(row, "telemetryJson"),
    media: optionalJson<PublishedMedia>(row, "mediaJson"),
    provenance: requiredJson<PublishedCreature["provenance"]>(row, "provenanceJson")
  };
}

function parseRunRow(row: Row): PublishedRun {
  return {
    id: requiredText(row, "id"),
    name: requiredText(row, "name"),
    hostId: optionalText(row, "hostId"),
    creatureCount: requiredNumber(row, "creatureCount"),
    slug: requiredText(row, "slug"),
    outputRoot: optionalText(row, "outputRoot"),
    runDir: optionalText(row, "runDir")
  };
}

function mapPublishedCatalog(catalog: PublishedCatalog): CatalogRecord {
  const taxaById = new Map(catalog.taxa.map((taxon) => [taxon.id, taxon]));
  const childSlugsByParentId = new Map<string, string[]>();
  const specimenIdsByTaxonId = new Map<string, string[]>();

  for (const taxon of catalog.taxa) {
    if (!taxon.parentId) {
      continue;
    }
    const childSlugs = childSlugsByParentId.get(taxon.parentId) ?? [];
    childSlugs.push(taxon.slug);
    childSlugsByParentId.set(taxon.parentId, childSlugs);
  }

  for (const creature of catalog.creatures) {
    for (const taxonId of [creature.familyId, creature.genusId, creature.speciesId]) {
      if (!taxonId) {
        continue;
      }
      const specimenIds = specimenIdsByTaxonId.get(taxonId) ?? [];
      specimenIds.push(creature.id);
      specimenIdsByTaxonId.set(taxonId, specimenIds);
    }
  }

  const ranges = {
    mass: collectRange(catalog.creatures.map((creature) => creature.metrics.massMean)),
    speed: collectRange(catalog.creatures.map(speedForCreature)),
    gyration: collectRange(catalog.creatures.map((creature) => creature.metrics.gyration)),
    complexity: collectRange(catalog.creatures.map((creature) => creature.metrics.complexityMean ?? 0))
  };

  const creatures = catalog.creatures.map((creature) => mapCreature(creature, taxaById, ranges));
  const taxa = catalog.taxa.map((taxon) => mapTaxon(taxon, specimenIdsByTaxonId, childSlugsByParentId));
  const runs = catalog.runs.map((run) => mapRun(run, creatures, catalog.creatures));

  const families = taxa.filter((taxon) => taxon.level === "family");
  const featuredCreatureIds = [...creatures]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(6, creatures.length))
    .map((creature) => creature.id);

  if (featuredCreatureIds.length === 0) {
    throw new Error("Published catalog has no creatures.");
  }

  const firstFamily = families[0]?.slug ?? mockCatalog.navigation[2]?.href.replace("/family/", "") ?? "";
  const firstRun = runs[0]?.id ?? mockCatalog.runs[0]?.id ?? "";

  return {
    headline: "Lenia Atlas",
    subheadline: `A museum-grade field guide to ${catalog.revision.creatureCount} published creatures across ${families.length} families.`,
    navigation: [
      { href: "/", label: "Collection" },
      { href: "/creatures", label: "Browse" },
      { href: "/ecology", label: "Ecology" },
      { href: firstFamily ? `/family/${firstFamily}` : "/", label: "Families" },
      { href: firstRun ? `/run/${firstRun}` : "/", label: "Runs" }
    ],
    featuredCreatureIds,
    creatures,
    taxa: taxa.sort((left, right) => left.name.localeCompare(right.name)),
    runs: runs.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function mapCreature(
  creature: PublishedCreature,
  taxaById: Map<string, PublishedTaxon>,
  ranges: { mass: Range; speed: Range; gyration: Range; complexity: Range }
): CreatureRecord {
  const family = creature.familyId ? taxaById.get(creature.familyId) : undefined;
  const genus = creature.genusId ? taxaById.get(creature.genusId) : undefined;
  const species = creature.speciesId ? taxaById.get(creature.speciesId) : undefined;
  const speed = speedForCreature(creature);
  const posterSrc = toPublicSrc(creature.media?.posterPath);
  const replaySrc = toPublicSrc(creature.media?.replayPath);

  return {
    id: creature.id,
    slug: creature.slug,
    name: creature.name,
    epithet: buildEpithet(creature, family, genus, species),
    tagline: buildTagline(creature, family, genus, species, speed),
    familySlug: family?.slug ?? fallbackSlug(creature.familyId, "untaxed-family"),
    genusSlug: genus?.slug ?? fallbackSlug(creature.genusId, "untaxed-genus"),
    speciesSlug: species?.slug ?? fallbackSlug(creature.speciesId, "untaxed-species"),
    runId: creature.runId,
    score: creature.score ?? 0,
    palette: LENIA_PALETTE,
    posterSrc,
    replaySrc,
    telemetry: buildTelemetry(creature, speed),
    metrics: [
      { label: "Mass", value: normalize(creature.metrics.massMean, ranges.mass), color: "#7ff5d0" },
      { label: "Velocity", value: normalize(speed, ranges.speed), color: "#f0912f" },
      { label: "Gyration", value: normalize(creature.metrics.gyration, ranges.gyration), color: "#57c6ff" },
      {
        label: "Complexity",
        value: normalize(creature.metrics.complexityMean ?? 0, ranges.complexity),
        color: "#a76dff"
      }
    ],
    anatomyPanels: [
      {
        key: "field",
        label: "Field",
        caption: "Canonical scalar field on the Lenia spectrum.",
        palette: LENIA_PALETTE,
        imageSrc: anatomyImageSrc(creature.media, "field", posterSrc)
      },
      {
        key: "delta",
        label: "Delta",
        caption: "Growth contrast keeps the translational bias visible.",
        palette: ["#dfdfdf", "#87f887", "#ffc764", "#ff5b62"],
        imageSrc: anatomyImageSrc(creature.media, "delta")
      },
      {
        key: "neighbor",
        label: "Neighbor",
        caption: "Neighborhood pressure reveals the support envelope.",
        palette: ["#7df0ff", "#6ab0ff", "#975dff", "#f5db63"],
        imageSrc: anatomyImageSrc(creature.media, "neighbor")
      },
      {
        key: "kernel",
        label: "Kernel",
        caption: "Kernel structure grounds the taxonomic silhouette.",
        palette: ["#7df0ff", "#92b4ff", "#ce71ff", "#ffd55f"],
        imageSrc: anatomyImageSrc(creature.media, "kernel")
      }
    ]
  };
}

function mapTaxon(
  taxon: PublishedTaxon,
  specimenIdsByTaxonId: Map<string, string[]>,
  childSlugsByParentId: Map<string, string[]>
): TaxonRecord {
  const specimenIds = [...(specimenIdsByTaxonId.get(taxon.id) ?? [])].sort((left, right) => left.localeCompare(right));
  const childSlugs = [...(childSlugsByParentId.get(taxon.id) ?? [])].sort((left, right) => left.localeCompare(right));
  const averageScore = typeof taxon.averageScore === "number" ? taxon.averageScore.toFixed(2) : "n/a";

  return {
    level: taxon.rank,
    slug: taxon.slug,
    name: taxon.label,
    kicker: taxon.rank[0].toUpperCase() + taxon.rank.slice(1),
    description: `${taxon.creatureCount} published specimens. Average score ${averageScore}.`,
    heroCreatureId: taxon.heroCreatureId ?? specimenIds[0] ?? "",
    childSlugs,
    specimenIds
  };
}

function mapRun(run: PublishedRun, creatures: CreatureRecord[], sourceCreatures: PublishedCreature[]): RunRecord {
  const specimenIds = creatures
    .filter((creature) => creature.runId === run.id)
    .map((creature) => creature.id);
  const runDates = sourceCreatures
    .filter((creature) => creature.runId === run.id)
    .map((creature) => Date.parse(creature.recordedAt))
    .filter((value) => Number.isFinite(value));
  const familyCount = new Set(
    creatures.filter((creature) => creature.runId === run.id).map((creature) => creature.familySlug)
  ).size;

  return {
    id: run.id,
    title: run.name,
    date: formatDate(runDates.length > 0 ? new Date(Math.min(...runDates)) : undefined),
    host: run.hostId ?? "Unknown host",
    narrative: `${run.creatureCount} indexed specimens spanning ${familyCount} families in the published atlas.`,
    specimenIds
  };
}

function buildTelemetry(creature: PublishedCreature, speed: number): MotionTelemetry {
  const vx = creature.metrics.velocityX;
  const vy = creature.metrics.velocityY;
  const heading = creature.metrics.headingRad;
  if (creature.telemetry) {
    return {
      centroid: {
        x: clamp(creature.telemetry.centroid.x, 0.05, 0.95),
        y: clamp(creature.telemetry.centroid.y, 0.05, 0.95)
      },
      trail: creature.telemetry.trail.map((point) => ({
        x: clamp(point.x, 0.05, 0.95),
        y: clamp(point.y, 0.05, 0.95)
      })),
      vx,
      vy,
      speed,
      headingRad: heading
    };
  }
  const centroidX = clamp(0.5 + Math.cos(heading) * 0.08, 0.12, 0.88);
  const centroidY = clamp(0.5 - Math.sin(heading) * 0.08, 0.12, 0.88);

  return {
    centroid: { x: centroidX, y: centroidY },
    trail: [3, 2, 1].map((step) => ({
      x: clamp(centroidX - vx * 10 * step, 0.08, 0.92),
      y: clamp(centroidY + vy * 10 * step, 0.08, 0.92)
    })),
    vx,
    vy,
    speed,
    headingRad: heading
  };
}

function anatomyImageSrc(media: PublishedMedia | null | undefined, key: AnatomyPanelKey, fallback?: string): string | undefined {
  if (!media) {
    return fallback;
  }
  const byGroup = key === "field"
    ? media.anatomy?.fieldPath ?? media.anatomy?.field
    : key === "delta"
      ? media.anatomy?.deltaPath ?? media.anatomy?.delta
      : key === "neighbor"
        ? media.anatomy?.neighborPath ?? media.anatomy?.neighbor
        : media.anatomy?.kernelPath ?? media.anatomy?.kernel;
  const byKey = key === "field"
    ? media.fieldPath
    : key === "delta"
      ? media.deltaPath
      : key === "neighbor"
        ? media.neighborPath
        : media.kernelPath;
  return toPublicSrc(byGroup ?? byKey) ?? fallback;
}

function buildEpithet(
  creature: PublishedCreature,
  family?: PublishedTaxon,
  genus?: PublishedTaxon,
  species?: PublishedTaxon
): string {
  const label = species?.label ?? genus?.label ?? family?.label ?? "untaxed specimen";
  return `${creature.isStable ? "Stable" : "Provisional"} ${label.toLowerCase()}`;
}

function buildTagline(
  creature: PublishedCreature,
  family: PublishedTaxon | undefined,
  genus: PublishedTaxon | undefined,
  species: PublishedTaxon | undefined,
  speed: number
): string {
  const lineage = species?.label ?? genus?.label ?? family?.label ?? "specimen";
  return `${speedDescriptor(speed)} ${lineage.toLowerCase()} with ${complexityDescriptor(
    creature.metrics.complexityMean ?? 0
  )} morphology and explicit centroid telemetry.`;
}

function speedForCreature(creature: PublishedCreature): number {
  return Math.hypot(creature.metrics.velocityX, creature.metrics.velocityY) || creature.metrics.centerVelocity;
}

function speedDescriptor(speed: number): string {
  if (speed >= 0.01) {
    return "High-speed";
  }
  if (speed >= 0.004) {
    return "Motile";
  }
  if (speed >= 0.001) {
    return "Slow-drifting";
  }
  return "Near-stationary";
}

function complexityDescriptor(complexity: number): string {
  if (complexity >= 0.15) {
    return "high-complexity";
  }
  if (complexity >= 0.06) {
    return "medium-complexity";
  }
  return "low-complexity";
}

function requiredTaxonLevel(row: Row, key: string): TaxonLevel {
  const value = requiredText(row, key);
  if (value === "family" || value === "genus" || value === "species") {
    return value;
  }
  throw new Error(`Invalid taxon level for ${key}: ${value}`);
}

function requiredJson<T>(row: Row, key: string): T {
  const value = optionalText(row, key);
  if (value === undefined) {
    throw new Error(`Missing JSON column ${key}`);
  }
  return JSON.parse(value) as T;
}

function optionalJson<T>(row: Row, key: string): T | undefined {
  const value = optionalText(row, key);
  return value === undefined ? undefined : (JSON.parse(value) as T);
}

function requiredBoolean(row: Row, key: string): boolean {
  const value = row[key];
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "bigint") {
    return value !== 0n;
  }
  if (typeof value === "string") {
    if (value === "0") {
      return false;
    }
    if (value === "1") {
      return true;
    }
  }
  throw new Error(`Invalid boolean column ${key}`);
}

function requiredText(row: Row, key: string): string {
  const value = optionalText(row, key);
  if (value === undefined) {
    throw new Error(`Missing text column ${key}`);
  }
  return value;
}

function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  throw new Error(`Invalid text column ${key}`);
}

function requiredNumber(row: Row, key: string): number {
  const value = optionalNumber(row, key);
  if (value === undefined) {
    throw new Error(`Missing numeric column ${key}`);
  }
  return value;
}

function optionalNumber(row: Row, key: string): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Invalid numeric column ${key}`);
}

function firstExistingPath(candidates: string[]): string | undefined {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireById<T extends { id: string }>(rows: T[], id: string): T {
  const match = rows.find((row) => row.id === id);
  if (!match) {
    throw new Error(`Missing row for id=${id}`);
  }
  return match;
}

function requireBySlug<T extends { slug: string }>(rows: T[], slug: string): T {
  const match = rows.find((row) => row.slug === slug);
  if (!match) {
    throw new Error(`Missing row for slug=${slug}`);
  }
  return match;
}

function collectRange(values: number[]): Range {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: 0, max: Math.max(max, 1) };
  }
  return { min, max };
}

function normalize(value: number, range: Range): number {
  if (range.max <= range.min) {
    return 0.5;
  }
  return clamp((value - range.min) / (range.max - range.min), 0.06, 0.98);
}

function toPublicSrc(relativePath?: string | null): string | undefined {
  if (!relativePath) {
    return undefined;
  }
  if (/^https?:\/\//.test(relativePath)) {
    return relativePath;
  }
  if (relativePath.startsWith(`${ATLAS_BASE_PATH}/`)) {
    return relativePath;
  }
  const trimmed = relativePath.replace(/^\/+/, "");
  return `${ATLAS_BASE_PATH}/${trimmed}`;
}

function formatDate(date: Date | undefined): string {
  if (!date || !Number.isFinite(date.getTime())) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function fallbackSlug(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
