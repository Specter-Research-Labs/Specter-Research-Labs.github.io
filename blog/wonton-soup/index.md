# Wonton Soup: Proof Structures Under Interventions

`wonton-soup` is our intervention harness for proof-search experiments. The core question is simple:

when we perturb a solver's search process, does it return to the same proof structure, or settle into a different one?

We run wild-type and intervention sweeps over deterministic theorem samples, capture full search artifacts (`*_history.json`, `*_mcts_tree.json`, `*_graph.json`, `*_comparison.json`), and compare outcomes across seeds, tactics, providers, and backends.

![MCTS Proof Search Tree](../../assets/blog/wonton-soup/fig1-mcts-tree.png)

## 1. What We're Looking For

We treat proof search as a stochastic process over structured states.

- A perturbation can be a blocked tactic or tactic family, a seed change, or a policy/scheduler change.
- A response can be recovery to the same structural family or migration into a different attractor.
- The object of study is not only solve rate; it is the shape and stability of search trajectories.

This is why we log enough structure to replay and compare runs months later under fixed configuration.

## 2. Inspirations and Framing

Three threads from the [Diverse Intelligence](https://www.diverseintelligence.org/) research program motivate this setup.

### Search efficiency as a measurable quantity

[Chis-Ciure and Levin (2025)](https://link.springer.com/article/10.1007/s11229-025-05319-6) formalize biological intelligence as search efficiency in multi-scale problem spaces. Their central metric is the $log10$ of the ratio between the cost of a random walk and that of the observed agent: how many orders of magnitude of work does a directed policy save over maximal-entropy search? Even under conservative assumptions, they show that organisms as simple as amoebae navigating chemical gradients operate hundreds to sextillions of times more efficiently than a blind baseline.

We borrow this framing directly. Our $K$ metric is the same log-ratio, applied to proof search: $\tau_{blind}$ is the expected edge count for a null policy over the tactic action surface, $\tau_{agent}$ is the observed count, and $K = \log_{10}(\tau_{blind} / \tau_{agent})$. A positive $K$ means the solver is exploiting structure in the problem space rather than brute-forcing it.

### Local lesions, global behavioral readout

[Zhang, Goldstein, and Levin (2024)](https://arxiv.org/abs/2401.05375) reframe classical sorting algorithms as models of morphogenesis. Rather than treating algorithms as fixed computational procedures, they let each array element exert minimal local agency and implement sorting policies from the bottom up. The key finding is what happens under perturbation: when elements are "damaged" and cannot execute perfectly, the decentralized approach outperforms traditional implementations. Arrays with defective elements sort themselves more reliably than top-down implementations facing the same errors. The system exhibits unexpected competencies never explicitly programmed, including the ability to temporarily reduce local progress in order to navigate around a defect.

This is the template for our intervention protocol. We block one tactic or tactic family from a known solution path and rerun. The question is the same one Zhang et al. ask of their self-sorting arrays: does the system reroute around the lesion and still reach the goal, or does it collapse? And if it reroutes, is the resulting structure the same or different?

### Pattern-level invariants under perturbation

[Levin (2022)](https://arxiv.org/abs/2201.10346) introduces the TAME framework for understanding cognition across radically different substrates. The core insight is a deep symmetry between problem-solving in anatomical, physiological, transcriptional, and behavioral spaces: the same patterns of multi-scale competency appear regardless of whether the substrate is a cell colony, a regenerating planarian, or a neural network. TAME argues that what matters is not whether a particular mechanism is present, but whether a behavioral structure persists under perturbation across scales.

We adopt this as our primary object of study. In the same veing, we ask whether the proof-search trajectory belongs to the same structural family as the wild-type run. Basin analysis, GED families, and attractor clustering are all ways of asking the TAME question in a formal-methods setting: is the pattern invariant, or did the perturbation push the system into a genuinely different attractor?

### Mapping to proof search

In proof search, we try and have these three threads converge: block parts of tactic space, rerun under controlled budgets, and measure how structure changes. We then have:

- $K$ quantifies efficiency relative to blind.
- GED quantifies structural distance from wild-type.
- Basin analysis quantifies whether the system has one stable attractor or many.

Together, they let us ask whether a proof-search process exhibits the kind of robust, multi-path competency that Levin and collaborators study in biological systems, or whether it is brittle and path-dependent.

## 3. Harness and Corpus Design

The harness is built to keep comparisons honest:

- Artifact-backed corpora with explicit manifests and provenance.
- Gate A validation and Gate B capability sweeps for feasible-by-design slices.
- Deterministic selection (`--sample` + `--seed`) and pinned run configuration snapshots.
- Run-level schemas (`run_config.json`, `run_status.json`, `summary.json.gz`) that preserve provenance for later analysis and lake extraction.

## 4. Search Core: Centralized and Distributed MCTS

The core search path supports both centralized and distributed MCTS modes.

- Centralized mode runs a single global selection loop.
- Distributed mode uses multiple local agents over a shared frontier with inflight reservations and optional scheduling interventions (blocking, delays, reroute, virtual loss, depth/path bias).

Both modes keep compatible tree and trace artifacts, which lets us compare behavior without changing downstream analysis contracts.

![Distributed Frontier](../../assets/blog/wonton-soup/fig9-distributed-frontier.png)

## 5. Multi-Backend Surface

`wonton-soup` currently supports five backends:

- `lean`
- `coq`
- `e`
- `vampire`
- `z3`

The run schema is shared across backends, while backend-specific capabilities are explicit via capability flags and file-presence checks (for example, proof-term-only fields vs trace-graph-only fields).

## 6. Metrics Surface

We use a metric stack, not a single score:

- K-style search efficiency (`k_search_efficiency`) from trace-derived blind nulls.
- Paper-style paired blind baseline (`paper_k`) from basin runs with `--basin-blind`.
- GED families (`ged_search_graph`, `ged_search_graph_soft`, `ged_proof_graph`, `ged_trace_graph`) with explicit validity metadata.
- Trajectory comparison (divergence, reconvergence, recovery iterations).
- Basin analysis (solve rate, structure hash diversity, dominant basin frequency).
- Sheaf analyses (equivalence consistency and tactic-transform residuals).
- Cross-run lake exports for reproducible, cross-experiment aggregation.

### Quick Metric Interpretation

| Metric | What changed in the intervention run | How to read it |
| --- | --- | --- |
| `k_search_efficiency` / `paper_k` | Attempted edge count before first solve ($\tau_{agent}$) vs blind baseline ($\tau_{blind}$) | Higher is better; $K > 0$ means fewer attempts than blind |
| `normalized GED_search` | Search-graph structure relative to wild-type | Near `0` means structurally similar search; larger values mean stronger reroute |
| shared prefix | Number of early wild-type steps replayed before divergence | High prefix means late divergence; low prefix means early policy/path change |
| divergence iteration/depth | First step where intervention path differs | Lower means early structural perturbation; higher means late perturbation |
| solve status under block | Whether constrained run still reaches terminal proof | Distinguishes robust reroute from true tactic dependency |
| basin mass + attractor ID | Fraction of seeds ending in each clustered trajectory family | Concentrated mass indicates stable basin; split mass indicates multimodal behavior |

K is reported as:

$$K = \log_{10}\left( \frac{\tau_{blind}}{\tau_{agent}} \right)$$

Example calibration: $K=\log_{10}(120/9)=1.12$ (about $13\times$ fewer attempts than blind).

![K-Metric Visualization](../../assets/blog/wonton-soup/fig7-k-metric.png)

- **$\tau_{agent}$**: attempted tactic edges until first terminal solve in the observed search graph.
- **$\tau_{blind}$**: expected attempted edges for a matched blind null policy over the same action surface.
- **$K$**: orders-of-magnitude efficiency over blind (`K > 0` is better than blind).

Two related outputs:

- `k_search_efficiency`: trace-derived null model from postprocess.
- `paper_k`: paired blind baseline from basin runs with `--basin-blind`.

## 7. Intervention Protocol

For each theorem, we first solve a wild-type run and extract the solution path $\pi = \{\tau_1, \dots, \tau_n\}$. We then run controlled lesions by blocking one tactic (or tactic family) from that path and rerun under the same budget and configuration.

This gives a clean comparison: same theorem, same search budget, one constrained action channel, repeated across all path tactics.

![Canonical Loop](../../assets/blog/wonton-soup/fig6-canonical-loop.png)

### How to Read Attractor Analysis

![Attractor Analysis](../../assets/blog/wonton-soup/fig4-attractors.png)

- Panel A (GED matrix): pairwise structural distance between runs.
- Panel B (clustering + cut): where we place the cut determines attractor families.
- Panel C (basins): seed mass captured by each attractor family.

Interpretation: low GED + large shared basin mass implies robust proof structure; high GED with split mass implies genuine rerouting under intervention.

## 8. Log-Derived Vignettes

### A. Alternate Tactic at Same Structure

From **2026-02-08** (`research-deepseek-50-123`, theorem `ds_0124_thm_2218`):

- `block norm_num at *`: solved, shared prefix `3/3`, normalized GED `0.00`.
- `block intros`: solved, shared prefix `1/3`, divergence at iteration `1`, normalized GED `0.40`.
- `block norm_num1`: unsolved, shared prefix `2/3`, divergence at iteration `2`, normalized GED `0.40`.

![Log vignette: block `norm_num at *` — Outcome: solved via local tactic swap; shared prefix `3/3`, divergence `∅`, normalized GED_search `0.00`. From logs: 2026-02-08 (research-deepseek-50-123, ds_0124_thm_2218).](../../assets/blog/wonton-soup/fig10-log-block-norm-num.png){.log-vignette}

Interpretation: this is a robust reroute-without-structural-change case; the blocked edge is replaced locally while preserving the same goal-signature trajectory.

![Log vignette: block `intros` — Outcome: solved; shared prefix `1/3`, divergence at iteration `1`, normalized GED_search `0.40`. From logs: 2026-02-08 (research-deepseek-50-123, ds_0124_thm_2218).](../../assets/blog/wonton-soup/fig11-log-block-intros.png){.log-vignette}

Interpretation: this is an early divergence with recovery; the run shifts to a different intermediate subgoal family but still converges to a solve.

![Log vignette: block `norm_num1` — Outcome: unsolved under block; shared prefix `2/3`, divergence at iteration `2`, normalized GED_search `0.40`. From logs: 2026-02-08 (research-deepseek-50-123, ds_0124_thm_2218).](../../assets/blog/wonton-soup/fig12-log-block-norm-num1.png){.log-vignette}

Interpretation: this is a brittle point; after partial prefix replay the run collapses, indicating `norm_num1` is load-bearing in this region of search.

### B. Different Theorems, Different Intervention Patterns

From **2026-02-04** (`dmcts-sweep-2026-02-04-heavy-grid-seed0-baseline`):

- `contrapositive_w43`: wild path `contrapose! hnq -> exact h hnq`; block `contrapose!` reroutes to `intro hP -> exact hnq (h hP)`.
- `nat_succ_pred_w110`: wild path `rw [succ_pred] -> positivity`; block `positivity` reroutes to `rw [succ_pred] -> exact Nat.ne_of_gt h`.
- `iff_intro_w18`: wild path `constructor -> exact hpq`; block `exact` reroutes to `constructor -> assumption`.

![Log vignette: block `contrapose!` — Outcome: solved via alternate proof after blocking `contrapose!`. From logs: 2026-02-04 (dmcts-sweep-2026-02-04-heavy-grid-seed0-baseline, contrapositive_w43).](../../assets/blog/wonton-soup/fig13-log-block-contrapose.png){.log-vignette}

Interpretation: blocking `contrapose!` forces a forward proof via `intro`, flipping the intermediate goal from $Q$ to $\mathsf{False}$ before discharge.

![Log vignette: block `positivity` — Outcome: solved; blocked `positivity` replaced by an explicit `Nat.ne_of_gt` proof. From logs: 2026-02-04 (dmcts-sweep-2026-02-04-heavy-grid-seed0-baseline, nat_succ_pred_w110).](../../assets/blog/wonton-soup/fig14-log-block-positivity.png){.log-vignette}

Interpretation: this is a local tactic swap: the proof keeps the same goal sequence but replaces an automated step with a direct lemma.

![Log vignette: block `exact` — Outcome: solved; blocked `exact` replaced by `assumption`. From logs: 2026-02-04 (dmcts-sweep-2026-02-04-heavy-grid-seed0-baseline, iff_intro_w18).](../../assets/blog/wonton-soup/fig15-log-block-exact.png){.log-vignette}

Interpretation: this is a shallow reroute; the structure is intact but the terminal discharge uses a different tactic.

## 9. Speculative Reach

This is an early slice from one primary provider and one MCTS policy family. The statements below are working hypotheses: grounded in current runs, intended to be pressure-tested as corpus and backend coverage expands.

### A. Proof space appears multistable

Under fixed prover, encoding, and budget, a nontrivial subset of theorems admits multiple recurrent proof families: trajectory clusters that different seeds and interventions converge to. We treat these as empirical basins: GED-clustered families with meaningful mass under a fixed perturbation protocol. In several cases, families are clearly separated in structure, not just notation.

This mirrors a pattern seen in morphospace: a planarian genome does not encode one anatomy, but a landscape of stable anatomies selected by conditions and perturbations. In our setting, basins look like stable features under the tested protocol, not artifacts of single trajectories.

### B. Constraint can generate competency

In multiple cases, tactic-block intervention solves a theorem that matched wild-type search does not solve under the same budget and seed settings. `set_inter_self` remains a clear example: blocking common high-prior tactics can redirect search into basins the unconstrained policy does not visit within budget.

[Zhang et al.](https://arxiv.org/abs/2401.05375) report an analogous effect in sorting: targeted local damage can improve global outcomes in decentralized dynamics. In both settings, constraint can increase solve probability on a meaningful subset of problems by forcing alternate structure.

### C. Search efficiency is cognitive content, not metaphor

When $K > 0$, search is more efficient than blind tactic enumeration; larger positive $K$ indicates stronger savings over blind baselines. This follows the same functional form used by [Chis-Ciure and Levin (2025)](https://link.springer.com/article/10.1007/s11229-025-05319-6): blind cost over observed cost, on a log scale.

Cross-substrate comparability depends on null-model calibration to each action surface. That calibration is active work. If calibration holds, proof search and biological systems can be compared on a shared efficiency axis.

### D. Proof structures may be discovered rather than constructed

When wild-type runs, tactic blocks, and seed variation repeatedly converge to the same proof family (low internal GED within a basin), that pattern is less plausibly solver-specific. A practical interpretation is that search acts as an interface to an underlying structural family.

This is aligned with the [TAME thesis](https://arxiv.org/abs/2201.10346): persistence under perturbation is the key signal. If the same family recurs across controlled perturbations, that family behaves like an invariant of the tested policy space.

### E. Substrates may function as pointers

Multistability, lesion robustness, and measurable efficiency over blind search appear in regenerating planaria, self-sorting arrays, and MCTS proof search under interventions. The microphysics differ; the operational signatures are notably similar.

Our current hypothesis is that pattern-level structure is primary and substrates are interfaces through which that structure is expressed. Whether this reflects a deep principle or a measurement coincidence remains open, and testable.

What comes next: broader corpora, more providers and backends, cross-backend basin agreement tests, and calibrated $K$ estimation at scale with matched null models.

---

*This is a technical draft for the Specter Labs research blog. For live data, visit the [Wonton Soup Dashboard](/dashboards/wonton-soup/).*
