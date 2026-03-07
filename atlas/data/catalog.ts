export type TaxonLevel = "family" | "genus" | "species";

export type MetricSample = {
  label: string;
  value: number;
  color: string;
};

export type MotionTelemetry = {
  centroid: { x: number; y: number };
  trail: Array<{ x: number; y: number }>;
  vx: number;
  vy: number;
  speed: number;
  headingRad: number;
};

export type CreatureRecord = {
  id: string;
  slug: string;
  name: string;
  epithet: string;
  tagline: string;
  familySlug: string;
  genusSlug: string;
  speciesSlug: string;
  runId: string;
  score: number;
  palette: [string, string, string, string];
  posterSrc?: string;
  replaySrc?: string;
  telemetry: MotionTelemetry;
  metrics: MetricSample[];
  anatomyPanels: Array<{
    key: "field" | "delta" | "neighbor" | "kernel";
    label: string;
    caption: string;
    palette: [string, string, string, string];
    imageSrc?: string;
  }>;
};

export type TaxonRecord = {
  level: TaxonLevel;
  slug: string;
  name: string;
  kicker: string;
  description: string;
  heroCreatureId: string;
  childSlugs: string[];
  specimenIds: string[];
};

export type RunRecord = {
  id: string;
  title: string;
  date: string;
  host: string;
  narrative: string;
  specimenIds: string[];
};

export type CatalogRecord = {
  headline: string;
  subheadline: string;
  navigation: Array<{ href: string; label: string }>;
  featuredCreatureIds: string[];
  creatures: CreatureRecord[];
  taxa: TaxonRecord[];
  runs: RunRecord[];
};

export const catalog: CatalogRecord = {
  headline: "Lenia Atlas",
  subheadline: "A museum-grade field guide to discovered morphologies, ecologies, and trajectories.",
  navigation: [
    { href: "/", label: "Collection" },
    { href: "/creatures", label: "Browse" },
    { href: "/ecology", label: "Ecology" },
    { href: "/family/orbital-gliders", label: "Families" },
    { href: "/run/qg-nnea-s300000", label: "Runs" }
  ],
  featuredCreatureIds: [
    "orbitium-unicaudatus-02",
    "aurora-lancer-01",
    "lattice-choir-03"
  ],
  creatures: [
    {
      id: "orbitium-unicaudatus-02",
      slug: "orbitium-unicaudatus-02",
      name: "O2 Orbitium unicaudatus",
      epithet: "Single-tail orbital drifter",
      tagline: "Fast, asymmetric transport with a bright thermal core and clean heading telemetry.",
      familySlug: "orbital-gliders",
      genusSlug: "orbitia",
      speciesSlug: "orbitium-unicaudatus",
      runId: "qg-nnea-s300000",
      score: 150.8899,
      palette: ["#63f2ff", "#4972ff", "#b329ff", "#ffcf38"],
      telemetry: {
        centroid: { x: 0.56, y: 0.42 },
        trail: [
          { x: 0.44, y: 0.56 },
          { x: 0.48, y: 0.51 },
          { x: 0.52, y: 0.47 }
        ],
        vx: 0.0084,
        vy: -0.0052,
        speed: 0.0099,
        headingRad: -0.5543
      },
      metrics: [
        { label: "Mass", value: 0.74, color: "#7ff5d0" },
        { label: "Velocity", value: 0.91, color: "#f0912f" },
        { label: "Gyration", value: 0.63, color: "#57c6ff" },
        { label: "Complexity", value: 0.52, color: "#a76dff" }
      ],
      anatomyPanels: [
        {
          key: "field",
          label: "Field",
          caption: "Radiant mass map on a black stage.",
          palette: ["#63f2ff", "#4972ff", "#b329ff", "#ff7348"]
        },
        {
          key: "delta",
          label: "Delta",
          caption: "Growth map emphasizes the thermal nose and tail wake.",
          palette: ["#e5e5e5", "#8cf78a", "#ffa849", "#ff4d70"]
        },
        {
          key: "neighbor",
          label: "Neighbor",
          caption: "Neighborhood response resolves the orbital channel.",
          palette: ["#7df0ff", "#5ba8ff", "#9865ff", "#f4d454"]
        },
        {
          key: "kernel",
          label: "Kernel",
          caption: "Tight radial core with a warm outer ring.",
          palette: ["#63f2ff", "#87c1ff", "#d16cff", "#ffcf38"]
        }
      ]
    },
    {
      id: "aurora-lancer-01",
      slug: "aurora-lancer-01",
      name: "Aurora lancer",
      epithet: "High-speed hooked spear",
      tagline: "Sharp spearhead geometry with a persistent cyan wake and a steep ballistic vector.",
      familySlug: "orbital-gliders",
      genusSlug: "auroria",
      speciesSlug: "aurora-lancer",
      runId: "qg-nnea-s300064",
      score: 145.1201,
      palette: ["#63f2ff", "#5385ff", "#cb2cff", "#ff9f2f"],
      telemetry: {
        centroid: { x: 0.62, y: 0.36 },
        trail: [
          { x: 0.45, y: 0.59 },
          { x: 0.5, y: 0.5 },
          { x: 0.56, y: 0.43 }
        ],
        vx: 0.0107,
        vy: -0.0092,
        speed: 0.0141,
        headingRad: -0.7103
      },
      metrics: [
        { label: "Mass", value: 0.62, color: "#79f4d8" },
        { label: "Velocity", value: 0.97, color: "#f0912f" },
        { label: "Gyration", value: 0.58, color: "#57c6ff" },
        { label: "Complexity", value: 0.47, color: "#a76dff" }
      ],
      anatomyPanels: [
        {
          key: "field",
          label: "Field",
          caption: "Crescent shell around a hot translational core.",
          palette: ["#63f2ff", "#4f8bff", "#c72dff", "#ff8b32"]
        },
        {
          key: "delta",
          label: "Delta",
          caption: "Positive growth concentrates at the forward edge.",
          palette: ["#dfdfdf", "#87f887", "#ffc764", "#ff5b62"]
        },
        {
          key: "neighbor",
          label: "Neighbor",
          caption: "Neighbor sum tracks the spear cavity and wake.",
          palette: ["#7df0ff", "#6ab0ff", "#975dff", "#f5db63"]
        },
        {
          key: "kernel",
          label: "Kernel",
          caption: "Narrow kernel emphasizes translational stability.",
          palette: ["#63f2ff", "#9bb8ff", "#d16cff", "#ffd24a"]
        }
      ]
    },
    {
      id: "lattice-choir-03",
      slug: "lattice-choir-03",
      name: "Lattice choir",
      epithet: "Slow resonant halo",
      tagline: "Low-speed resonance with a ringed halo and richer mass symmetry than the transport class.",
      familySlug: "choral-halos",
      genusSlug: "choralia",
      speciesSlug: "lattice-choir",
      runId: "qg-nnea-s300128",
      score: 132.4012,
      palette: ["#7ff8ff", "#45a4ff", "#b43eff", "#ffd46b"],
      telemetry: {
        centroid: { x: 0.51, y: 0.53 },
        trail: [
          { x: 0.48, y: 0.55 },
          { x: 0.49, y: 0.54 },
          { x: 0.5, y: 0.535 }
        ],
        vx: 0.0017,
        vy: -0.0006,
        speed: 0.0018,
        headingRad: -0.3393
      },
      metrics: [
        { label: "Mass", value: 0.81, color: "#79f4d8" },
        { label: "Velocity", value: 0.22, color: "#f0912f" },
        { label: "Gyration", value: 0.84, color: "#57c6ff" },
        { label: "Complexity", value: 0.67, color: "#a76dff" }
      ],
      anatomyPanels: [
        {
          key: "field",
          label: "Field",
          caption: "Circular ring and luminous medallion core.",
          palette: ["#7df4ff", "#4cbdff", "#c94fff", "#ffdd72"]
        },
        {
          key: "delta",
          label: "Delta",
          caption: "Balanced growth with low directional asymmetry.",
          palette: ["#ececec", "#8bf88d", "#ffc45d", "#ff6280"]
        },
        {
          key: "neighbor",
          label: "Neighbor",
          caption: "Neighbor envelope remains nearly concentric.",
          palette: ["#7df0ff", "#77c0ff", "#9b6bff", "#f4dc71"]
        },
        {
          key: "kernel",
          label: "Kernel",
          caption: "Broad kernel supports ring persistence.",
          palette: ["#7df0ff", "#92b4ff", "#ce71ff", "#ffd55f"]
        }
      ]
    }
  ],
  taxa: [
    {
      level: "family",
      slug: "orbital-gliders",
      name: "Orbital gliders",
      kicker: "Family",
      description: "Asymmetric, transport-forward organisms that hold a visible heading and leave a readable wake.",
      heroCreatureId: "orbitium-unicaudatus-02",
      childSlugs: ["orbitia", "auroria"],
      specimenIds: ["orbitium-unicaudatus-02", "aurora-lancer-01"]
    },
    {
      level: "family",
      slug: "choral-halos",
      name: "Choral halos",
      kicker: "Family",
      description: "Resonant, ring-biased organisms with slower centroid drift and stronger radial balance.",
      heroCreatureId: "lattice-choir-03",
      childSlugs: ["choralia"],
      specimenIds: ["lattice-choir-03"]
    },
    {
      level: "genus",
      slug: "orbitia",
      name: "Orbitia",
      kicker: "Genus",
      description: "Transport organisms with a soft orbital cavity and a single dominant tail.",
      heroCreatureId: "orbitium-unicaudatus-02",
      childSlugs: ["orbitium-unicaudatus"],
      specimenIds: ["orbitium-unicaudatus-02"]
    },
    {
      level: "genus",
      slug: "auroria",
      name: "Auroria",
      kicker: "Genus",
      description: "Fast hooked gliders with stronger nose-weighted growth signatures.",
      heroCreatureId: "aurora-lancer-01",
      childSlugs: ["aurora-lancer"],
      specimenIds: ["aurora-lancer-01"]
    },
    {
      level: "genus",
      slug: "choralia",
      name: "Choralia",
      kicker: "Genus",
      description: "Low-displacement rings that privilege coherence over ballistic motion.",
      heroCreatureId: "lattice-choir-03",
      childSlugs: ["lattice-choir"],
      specimenIds: ["lattice-choir-03"]
    },
    {
      level: "species",
      slug: "orbitium-unicaudatus",
      name: "Orbitium unicaudatus",
      kicker: "Species",
      description: "Single-tail orbiters with strong forward asymmetry and a clear heading vector.",
      heroCreatureId: "orbitium-unicaudatus-02",
      childSlugs: [],
      specimenIds: ["orbitium-unicaudatus-02"]
    },
    {
      level: "species",
      slug: "aurora-lancer",
      name: "Aurora lancer",
      kicker: "Species",
      description: "Needle-like gliders with high velocity and a compressed warm front.",
      heroCreatureId: "aurora-lancer-01",
      childSlugs: [],
      specimenIds: ["aurora-lancer-01"]
    },
    {
      level: "species",
      slug: "lattice-choir",
      name: "Lattice choir",
      kicker: "Species",
      description: "Halo organisms with a centered medallion core and restrained translational drift.",
      heroCreatureId: "lattice-choir-03",
      childSlugs: [],
      specimenIds: ["lattice-choir-03"]
    }
  ],
  runs: [
    {
      id: "qg-nnea-s300000",
      title: "Quality-gated NNEA block 300000",
      date: "2026-02-28",
      host: "quality-gated atlas corpus",
      narrative: "A dense, stable run slice with strong transport exemplars and unusually readable heading telemetry.",
      specimenIds: ["orbitium-unicaudatus-02"]
    },
    {
      id: "qg-nnea-s300064",
      title: "Quality-gated NNEA block 300064",
      date: "2026-02-28",
      host: "quality-gated atlas corpus",
      narrative: "Fast glider corridor with high-score ballistic forms.",
      specimenIds: ["aurora-lancer-01"]
    },
    {
      id: "qg-nnea-s300128",
      title: "Quality-gated NNEA block 300128",
      date: "2026-02-28",
      host: "quality-gated atlas corpus",
      narrative: "Low-speed resonant pocket with halo-like morphology.",
      specimenIds: ["lattice-choir-03"]
    }
  ]
};
