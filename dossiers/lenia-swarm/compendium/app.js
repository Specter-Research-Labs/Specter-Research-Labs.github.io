const manifestUrl = new URL("./data/manifest.json", window.location.href);

const releaseSelect = document.getElementById("release-select");
const sortSelect = document.getElementById("sort-order");
const detailPathInput = document.getElementById("detail-path");
const gridRoot = document.getElementById("compendium-grid");
const detailRoot = document.getElementById("compendium-detail");

const LENIA_SPECTRUM = [
    [0, 0, 0],
    [124, 245, 255],
    [80, 123, 255],
    [191, 55, 255],
    [255, 58, 175],
    [255, 113, 56],
    [255, 204, 69],
];
const DISPLAY_FLOOR_BYTE = 14;
const SPECTRUM_LOOKUP = buildSpectrumLookup();
const DELTA_LOOKUP = buildDeltaLookup();

let currentManifest = null;
let currentRelease = null;
let currentEntriesRaw = [];
let currentEntries = [];
let currentSort = "score";
let replayController = null;
const thumbReplayCache = new Map();
let thumbReplayControllers = [];

boot().catch((error) => {
    renderDetailMessage(
        "Failed to load compendium.",
        error instanceof Error ? error.message : String(error),
    );
});

async function boot() {
    const url = new URL(window.location.href);
    const explicitDetail = url.searchParams.get("detail");
    detailPathInput.value = explicitDetail ?? "";

    detailPathInput.addEventListener("change", () => {
        const value = detailPathInput.value.trim();
        const next = new URL(window.location.href);
        if (value) {
            next.searchParams.set("detail", value);
        } else {
            next.searchParams.delete("detail");
        }
        window.location.href = next.toString();
    });

    sortSelect.addEventListener("change", () => {
        currentSort = normalizeSortKey(sortSelect.value) ?? defaultSortForRelease(currentRelease);
        const next = new URL(window.location.href);
        next.searchParams.set("sort", currentSort);
        window.history.replaceState({}, "", next);
        currentEntries = sortEntries(currentEntriesRaw, currentSort);
        renderTileGrid(next.searchParams.get("detail"));
    });

    const hasRelease = url.searchParams.has("release");
    if (explicitDetail && !hasRelease) {
        releaseSelect.innerHTML = `<option>Direct Detail</option>`;
        releaseSelect.disabled = true;
        sortSelect.disabled = true;
        await loadDirectDetail(explicitDetail);
        renderListMessage(
            "Direct detail mode",
            "This page was opened with a direct detail payload. Remove the query parameter to browse manifest-backed releases.",
        );
        return;
    }

    window.addEventListener("popstate", () => {
        const params = new URL(window.location.href).searchParams;
        const detailPath = params.get("detail");
        if (detailPath && currentEntries.length > 0) {
            const entry = currentEntries.find((e) => e.detail === detailPath);
            if (entry) {
                renderTileGrid(entry.detail);
                loadEntryDetail(entry, { pushState: false });
                return;
            }
        }
        detailRoot.classList.remove("is-open");
        detailRoot.innerHTML = "";
        gridRoot.hidden = false;
        if (replayController) {
            replayController.stop();
            replayController = null;
        }
        renderTileGrid(null);
    });

    await loadManifest();
}

async function loadManifest() {
    currentManifest = await fetchJson(manifestUrl);
    const releases = Array.isArray(currentManifest.releases) ? currentManifest.releases : [];
    if (releases.length === 0) {
        releaseSelect.innerHTML = `<option>No releases published</option>`;
        releaseSelect.disabled = true;
        sortSelect.disabled = true;
        renderListMessage(
            "No published releases yet",
            "Publish a compendium release and point data/manifest.json at it, or open a published detail payload directly with ?detail=releases/<release-id>/details/<creature-id>.json.",
        );
        renderDetailMessage(
            "Inspector ready",
            "This surface is waiting for either a published release manifest or a direct exported creature detail payload.",
        );
        return;
    }

    const requestedRelease = new URL(window.location.href).searchParams.get("release");
    const defaultReleaseId = requestedRelease ?? currentManifest.default_release ?? releases[0].id;
    const selected = releases.find((release) => release.id === defaultReleaseId) ?? releases[0];

    releaseSelect.innerHTML = releases
        .map(
            (release) =>
                `<option value="${escapeHtml(release.id)}">${escapeHtml(release.label ?? release.id)}</option>`,
        )
        .join("");
    releaseSelect.value = selected.id;
    releaseSelect.disabled = false;
    releaseSelect.addEventListener("change", async () => {
        const next = new URL(window.location.href);
        next.searchParams.set("release", releaseSelect.value);
        window.history.replaceState({}, "", next);
        await loadRelease(releaseSelect.value);
    });

    await loadRelease(selected.id);
}

async function loadRelease(releaseId) {
    const releases = currentManifest.releases ?? [];
    const release = releases.find((item) => item.id === releaseId);
    if (!release) {
        renderListMessage("Unknown release", `No release named ${releaseId} exists in the manifest.`);
        return;
    }

    currentRelease = release;
    const indexUrl = new URL(release.index, manifestUrl);
    const payload = await fetchJson(indexUrl);
    const rawEntries = Array.isArray(payload) ? payload : payload.entries ?? [];
    currentEntriesRaw = rawEntries.map(normalizeEntry);
    currentSort = resolveSortFromLocation(currentRelease);
    sortSelect.value = currentSort;
    sortSelect.disabled = false;
    currentEntries = sortEntries(currentEntriesRaw, currentSort);

    if (currentEntries.length === 0) {
        renderListMessage(
            release.label ?? release.id,
            "This release exists, but its index contains no creatures yet.",
        );
        renderDetailMessage(
            "Empty release",
            "Publish entries with detail, baseConfig, and searchConfig fields to populate the compendium.",
        );
        return;
    }

    const requestedDetail = new URL(window.location.href).searchParams.get("detail");
    const initialEntry = requestedDetail
        ? currentEntries.find((entry) => entry.detail === requestedDetail)
        : null;

    renderTileGrid(initialEntry?.detail ?? null);
    if (initialEntry) {
        await loadEntryDetail(initialEntry);
    }
}

function renderTileGrid(activeDetailPath) {
    stopThumbReplays();
    gridRoot.innerHTML = "";

    const thumbObserver = new IntersectionObserver(
        (entries) => {
            for (const io of entries) {
                const ctrl = io.target._thumbReplay;
                if (!ctrl) continue;
                if (io.isIntersecting) {
                    ctrl.start();
                } else {
                    ctrl.pause();
                }
            }
        },
        { rootMargin: "200px" },
    );

    currentEntries.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";

        const media = entry.media ?? null;
        const posterUrl = media?.posterPath ? resolveManifestHref(media.posterPath) : null;
        const replayUrl = media?.replayPath ? resolveManifestHref(media.replayPath) : null;
        const metricBadge = tileMetricBadge(entry);

        button.className = `compendium-tile${entry.detail === activeDetailPath ? " is-active" : ""}`;
        button.innerHTML = `
            <span class="compendium-tile-thumb${posterUrl ? " has-media" : ""}">
                ${posterUrl ? `<img src="${escapeAttr(posterUrl)}" alt="" loading="lazy" />` : `<span class="compendium-tile-thumb-placeholder"></span>`}
            </span>
            <span class="compendium-tile-copy">
                <span class="compendium-tile-name">${escapeHtml(entry.name ?? entry.id ?? "Unnamed")}</span>
                <span class="compendium-tile-score">${escapeHtml(metricBadge)}</span>
            </span>
        `;
        button.addEventListener("click", async () => {
            renderTileGrid(entry.detail);
            await loadEntryDetail(entry);
        });
        gridRoot.appendChild(button);

        if (replayUrl) {
            const thumb = button.querySelector(".compendium-tile-thumb");
            const ctrl = createThumbReplay(thumb, replayUrl);
            button._thumbReplay = ctrl;
            thumbReplayControllers.push(ctrl);
            thumbObserver.observe(button);
        }
    });
}

function stopThumbReplays() {
    for (const ctrl of thumbReplayControllers) {
        ctrl.destroy();
    }
    thumbReplayControllers = [];
}

function createThumbReplay(thumb, replaySrc) {
    const canvas = document.createElement("canvas");
    thumb.prepend(canvas);

    let destroyed = false;
    let running = false;
    let animationFrame = 0;
    let loaded = null;

    const destroy = () => {
        destroyed = true;
        if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };

    const pause = () => {
        running = false;
        if (animationFrame !== 0) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }
    };

    const start = () => {
        if (destroyed || running) return;
        running = true;
        if (loaded) {
            beginAnimation(loaded);
        } else {
            loadAndPlay().catch(() => {
                canvas.remove();
            });
        }
    };

    return { start, pause, destroy };

    async function loadAndPlay() {
        const cached = thumbReplayCache.get(replaySrc);
        if (cached) {
            loaded = cached;
            if (running && !destroyed) beginAnimation(loaded);
            return;
        }

        const replayResponse = await fetch(replaySrc, { cache: "force-cache" });
        if (!replayResponse.ok) throw new Error(`${replayResponse.status}`);
        const manifest = await replayResponse.json();

        const framesSrc = resolveManifestHref(manifest.framesPath);
        const framesResponse = await fetch(framesSrc, { cache: "force-cache" });
        if (!framesResponse.ok) throw new Error(`${framesResponse.status}`);

        const frameBytes = new Uint8Array(await framesResponse.arrayBuffer());
        if (destroyed) return;

        const frameSize = manifest.width * manifest.height;
        const frameCount = Math.min(
            manifest.frameCount,
            Math.floor(frameBytes.length / Math.max(frameSize, 1)),
        );
        if (frameSize <= 0 || frameCount <= 0) throw new Error("empty");

        loaded = { frameBytes, frameSize, frameCount, width: manifest.width, height: manifest.height, fps: Math.max(manifest.fps, 1) };
        thumbReplayCache.set(replaySrc, loaded);

        if (running && !destroyed) beginAnimation(loaded);
    }

    function beginAnimation(data) {
        const ctx = prepareCanvas(canvas, data.width, data.height);
        if (!ctx || destroyed) return;

        const imageData = ctx.createImageData(data.width, data.height);
        const drawFrame = (frameIndex) => {
            paintReplayFrame(imageData.data, data.frameBytes, frameIndex * data.frameSize, data.frameSize);
            ctx.putImageData(imageData, 0, 0);
        };

        drawFrame(0);
        canvas.classList.add("is-live");

        const startTime = performance.now();
        const tick = (now) => {
            if (destroyed || !running) return;
            const frameIndex = Math.floor(((now - startTime) / 1000) * data.fps) % data.frameCount;
            drawFrame(frameIndex);
            animationFrame = window.requestAnimationFrame(tick);
        };
        animationFrame = window.requestAnimationFrame(tick);
    }
}

async function loadEntryDetail(entry, { pushState = true } = {}) {
    const detailUrl = new URL(entry.detail, manifestUrl);
    const detail = normalizeDetail(await fetchJson(detailUrl));

    if (pushState) {
        const next = new URL(window.location.href);
        next.searchParams.set("release", currentRelease.id);
        next.searchParams.set("detail", entry.detail);
        window.history.pushState({ release: currentRelease.id, detail: entry.detail }, "", next);
    }
    detailPathInput.value = entry.detail;

    renderDetail(detail, entry);
}

async function loadDirectDetail(detailPath) {
    const detailUrl = new URL(detailPath, manifestUrl);
    const detail = normalizeDetail(await fetchJson(detailUrl));
    renderDetail(detail, normalizeEntry({ detail: detailPath }));
}

function renderDetail(detail, entry) {
    if (replayController) {
        replayController.stop();
        replayController = null;
    }

    const creature = detail.creature ?? {};
    const metrics = creature.metrics ?? {};
    const media = detail.media ?? entry.media ?? null;
    const telemetry = resolveTelemetry(detail.telemetry ?? entry.telemetry, metrics);
    const posterUrl = media?.posterPath ? resolveManifestHref(media.posterPath) : null;
    const replayUrl = media?.replayPath ? resolveManifestHref(media.replayPath) : null;
    const anatomy = media?.anatomy ?? null;
    const detailLinks = [];

    if (entry.baseConfig) {
        detailLinks.push(`<a href="${escapeAttr(resolveManifestHref(entry.baseConfig))}">Base Config</a>`);
    }
    if (entry.searchConfig) {
        detailLinks.push(`<a href="${escapeAttr(resolveManifestHref(entry.searchConfig))}">Search Config</a>`);
    }
    if (media?.posterPath) {
        detailLinks.push(`<a href="${escapeAttr(posterUrl)}">Poster PNG</a>`);
    }
    if (media?.replayPath) {
        detailLinks.push(`<a href="${escapeAttr(replayUrl)}">Replay Manifest</a>`);
    }
    if (entry.detail) {
        detailLinks.push(`<a href="${escapeAttr(resolveManifestHref(entry.detail))}">Meta JSON</a>`);
    }

    const stageMarkup = media
        ? renderStage(media, posterUrl, replayUrl)
        : `
            <div class="compendium-stage-empty">
                <strong>No published media for this creature yet.</strong>
                <span>Re-run compendium-publish without --skip-media to render the stage assets.</span>
            </div>
        `;

    detailRoot.classList.add("is-open");
    gridRoot.hidden = true;
    detailRoot.innerHTML = `
        <button class="compendium-detail-close" type="button">Back to gallery</button>
        <div class="site-page-title">${escapeHtml(
            creature.name ?? entry.name ?? "Unnamed creature",
        )}</div>
        <p class="section-lead">
            Owner: ${escapeHtml(creature.ownerId ?? "unknown")}
            &nbsp;|&nbsp; Seed: ${escapeHtml(String(creature.phenotype?.seed ?? entry.seed ?? "---"))}
            &nbsp;|&nbsp; Run: ${escapeHtml(detail.runId ?? entry.runId ?? "unknown")}
        </p>

        <div class="compendium-viz-shell">
            <div class="compendium-viz-main">
                ${stageMarkup}
            </div>
            ${renderAnatomyStrip(anatomy, { live: Boolean(replayUrl) })}
        </div>

        ${renderEquationDeck(creature, metrics, telemetry, media)}

        <div class="detail-block">
            <span class="detail-block-title">Metrics</span>
            <div class="metric-grid">
                ${metricCard("Score", entry.score ?? creature.score ?? null)}
                ${metricCard("Stable", metrics.is_stable ?? metrics.isStable ?? entry.isStable ?? null)}
                ${metricCard("Mass", metrics.mass_mean ?? metrics.massMean)}
                ${metricCard("Occupancy", metrics.occupancy_mean ?? metrics.occupancyMean)}
                ${metricCard("Gyration", metrics.gyration)}
                ${metricCard("Velocity", metrics.center_velocity ?? metrics.centerVelocity)}
            </div>
        </div>

        <div class="detail-block">
            <span class="detail-block-title">Genotype</span>
            <pre>${escapeHtml(JSON.stringify(creature.genotype ?? {}, null, 2))}</pre>
        </div>

        <div class="detail-block">
            <span class="detail-block-title">Provenance</span>
            <pre>${escapeHtml(
                JSON.stringify(
                    {
                        runId: detail.runId ?? entry.runId ?? null,
                        runName: detail.runName ?? entry.runName ?? null,
                        campaignId: detail.campaignId ?? null,
                        recordedAt: detail.recordedAt ?? entry.recordedAt ?? null,
                        publishedAt: detail.publishedAt ?? null,
                        artifactSource: detail.artifactSource ?? null,
                        reason: detail.reason ?? null,
                        filtersPassed: detail.filtersPassed ?? entry.filtersPassed ?? null,
                        sourceDb: detail.sourceDb ?? null,
                    },
                    null,
                    2,
                ),
            )}</pre>
        </div>

        ${detailLinks.length ? `<div class="detail-links">${detailLinks.join("")}</div>` : ""}
    `;

    const closeButton = detailRoot.querySelector(".compendium-detail-close");
    if (closeButton) {
        closeButton.addEventListener("click", () => {
            detailRoot.classList.remove("is-open");
            detailRoot.innerHTML = "";
            gridRoot.hidden = false;
            if (replayController) {
                replayController.stop();
                replayController = null;
            }
            gridRoot.querySelectorAll(".compendium-tile.is-active").forEach((tile) => {
                tile.classList.remove("is-active");
            });
            const next = new URL(window.location.href);
            next.searchParams.delete("detail");
            window.history.pushState({ release: currentRelease?.id }, "", next);
        });
    }

    renderKatex(detailRoot);

    if (media && replayUrl) {
        const stage = detailRoot.querySelector("[data-replay-stage]");
        const anatomyUpdater = setupLiveAnatomy(detailRoot, creature.genotype ?? {});
        if (stage) {
            replayController = createReplayController(stage, replayUrl, (frameTelemetry) => {
                updateLiveTelemetry(detailRoot, frameTelemetry);
                if (anatomyUpdater) anatomyUpdater(frameTelemetry);
            });
        }
    }
}

function renderStage(_media, posterUrl, replayUrl) {
    return `
        <div class="compendium-stage" data-replay-stage>
            ${posterUrl ? `<img class="compendium-stage-poster" src="${escapeAttr(posterUrl)}" alt="" />` : ""}
            <canvas class="compendium-stage-canvas" aria-hidden="true"></canvas>
            ${replayUrl ? `<span class="compendium-stage-live-badge">replay</span>` : `<span class="compendium-stage-live-badge is-static">poster</span>`}
        </div>
    `;
}

function renderEquationDeck(creature, metrics, telemetry, media) {
    const genotype = creature.genotype ?? {};
    const cards = [
        renderEquationCard({
            kicker: "kernel",
            latex: "K_k(r) = \\sum_i b_{k,i} \\exp\\!\\left(-\\frac{(r - a_{k,i})^2}{2\\,w_{k,i}^2}\\right)",
            rows: [
                ["R", formatNumberish(genotype.R, 2)],
                ["r", formatNumberList(genotype.r, 2)],
                ["a", formatNestedNumberList(genotype.a, 2)],
                ["w", formatNestedNumberList(genotype.w, 2)],
                ["b", formatNestedNumberList(genotype.b, 2)],
            ],
        }),
        renderEquationCard({
            kicker: "growth",
            latex: "g_k(u) = h_k \\left[2\\exp\\!\\left(-\\frac{(u - m_k)^2}{2\\,s_k^2}\\right) - 1\\right]",
            rows: [
                ["m", formatNumberList(genotype.m, 2)],
                ["s", formatNumberList(genotype.s, 3)],
                ["h", formatNumberList(genotype.h, 2)],
            ],
        }),
        renderEquationCard({
            kicker: "motion",
            latex: "\\text{speed} = \\sqrt{v_x^2 + v_y^2} \\qquad \\theta = \\text{atan2}(v_y,\\, v_x)",
            rows: [
                ["vx", formatNumberish(telemetry?.vx ?? metrics.velocity_x ?? metrics.velocityX, 4), "vx"],
                ["vy", formatNumberish(telemetry?.vy ?? metrics.velocity_y ?? metrics.velocityY, 4), "vy"],
                ["speed", formatNumberish(telemetry?.speed ?? metrics.center_velocity ?? metrics.centerVelocity, 4), "speed"],
                ["heading", formatNumberish(telemetry?.headingRad ?? metrics.heading_rad ?? metrics.headingRad, 4), "heading"],
                ["centroid", formatCentroid(telemetry?.centroid), "centroid"],
                ["frame", "0 / ---", "frame"],
            ],
        }),
        renderEquationCard({
            kicker: "binding",
            rows: [
                ["stage", media?.replayPath ? "live replay" : media?.posterPath ? "poster only" : "no media"],
                ["anatomy", formatAnatomyAvailability(media?.anatomy)],
                ["mass density", formatMomentDensity(metrics)],
                ["config hash", creature.configHash ?? "---"],
            ],
        }),
    ];

    return `
        <section class="detail-block">
            <span class="detail-block-title">Equations</span>
            <div class="compendium-equation-grid">
                ${cards.join("")}
            </div>
        </section>
    `;
}

function renderEquationCard({ kicker, latex, rows }) {
    const formulaBlock = latex
        ? `<div class="compendium-equation-formula" data-katex="${escapeAttr(latex)}"></div>`
        : "";
    return `
        <article class="compendium-equation-card">
            <span class="compendium-equation-kicker">${escapeHtml(kicker)}</span>
            ${formulaBlock}
            <div class="compendium-equation-list">
                ${rows
                    .filter(([, value]) => value && value !== "---")
                    .map(
                        ([label, value, liveKey]) => `
                            <div class="compendium-equation-row">
                                <span class="compendium-equation-label">${escapeHtml(label)}</span>
                                <span class="compendium-equation-value"${liveKey ? ` data-live="${escapeAttr(liveKey)}"` : ""}>${escapeHtml(value)}</span>
                            </div>
                        `,
                    )
                    .join("")}
            </div>
        </article>
    `;
}

function renderKatex(root) {
    if (typeof katex === "undefined") return;
    root.querySelectorAll("[data-katex]").forEach((el) => {
        katex.render(el.dataset.katex, el, { displayMode: true, throwOnError: false });
    });
}

function updateLiveTelemetry(root, t) {
    const set = (key, value) => {
        const el = root.querySelector(`[data-live="${key}"]`);
        if (el) el.textContent = value;
    };
    set("vx", t.vx.toFixed(4));
    set("vy", t.vy.toFixed(4));
    set("speed", t.speed.toFixed(4));
    set("heading", t.heading.toFixed(4));
    set("centroid", `${t.centroidX.toFixed(3)}, ${t.centroidY.toFixed(3)}`);
    set("frame", `${t.frameIndex + 1} / ${t.frameCount}`);
}

function renderAnatomyStrip(anatomy, { live = false } = {}) {
    if (live) {
        return `
            <div class="compendium-viz-anatomy">
                <figure class="compendium-anatomy-card">
                    <canvas data-anatomy="field" width="128" height="128"></canvas>
                    <figcaption>Field f(x)</figcaption>
                </figure>
                <figure class="compendium-anatomy-card">
                    <canvas data-anatomy="delta" width="128" height="128"></canvas>
                    <figcaption>Delta df/dt</figcaption>
                </figure>
                <figure class="compendium-anatomy-card">
                    <canvas data-anatomy="kernel" width="128" height="128"></canvas>
                    <figcaption>Kernel K(r)</figcaption>
                </figure>
                <figure class="compendium-anatomy-card">
                    ${anatomy?.neighborPath
                        ? `<img src="${escapeAttr(resolveManifestHref(anatomy.neighborPath))}" alt="Neighbor" loading="lazy" />`
                        : `<canvas data-anatomy="neighbor-placeholder" width="128" height="128"></canvas>`}
                    <figcaption>Neighbor k*f</figcaption>
                </figure>
            </div>
        `;
    }

    if (!anatomy) {
        return "";
    }

    const panels = [
        ["Field f(x)", anatomy.fieldPath],
        ["Delta df/dt", anatomy.deltaPath],
        ["Neighbor k*f", anatomy.neighborPath],
        ["Kernel K(r)", anatomy.kernelPath],
    ].filter(([, path]) => Boolean(path));

    if (panels.length === 0) {
        return "";
    }

    return `
        <div class="compendium-viz-anatomy">
            ${panels
                .map(
                    ([label, path]) => `
                        <figure class="compendium-anatomy-card">
                            <img src="${escapeAttr(resolveManifestHref(path))}" alt="${escapeAttr(label)}" loading="lazy" />
                            <figcaption>${escapeHtml(label)}</figcaption>
                        </figure>
                        `,
                    )
                    .join("")}
        </div>
    `;
}

function createReplayController(stage, replaySrc, onFrame) {
    const canvas = stage.querySelector("canvas");
    if (!canvas) {
        return { stop() {} };
    }

    let cancelled = false;
    let animationFrame = 0;

    const stop = () => {
        cancelled = true;
        if (animationFrame !== 0) {
            window.cancelAnimationFrame(animationFrame);
        }
    };

    loadReplay().catch((error) => {
        console.error(error);
        stage.classList.remove("is-live");
    });

    return { stop };

    async function loadReplay() {
        const replayResponse = await fetch(replaySrc, { cache: "force-cache" });
        if (!replayResponse.ok) {
            throw new Error(`Failed to load replay manifest: ${replayResponse.status}`);
        }
        const manifest = await replayResponse.json();
        const framesSrc = resolveManifestHref(manifest.framesPath);
        const framesResponse = await fetch(framesSrc, { cache: "force-cache" });
        if (!framesResponse.ok) {
            throw new Error(`Failed to load replay frames: ${framesResponse.status}`);
        }

        const frameBytes = new Uint8Array(await framesResponse.arrayBuffer());
        if (cancelled) {
            return;
        }

        const frameSize = manifest.width * manifest.height;
        const frameCount = Math.min(
            manifest.frameCount,
            Math.floor(frameBytes.length / Math.max(frameSize, 1)),
        );
        if (frameSize <= 0 || frameCount <= 0) {
            throw new Error("Replay payload is empty.");
        }

        const context = prepareCanvas(canvas, manifest.width, manifest.height);
        if (!context) {
            return;
        }

        const centroids = Array.isArray(manifest.centroids) ? manifest.centroids : [];
        const velocities = Array.isArray(manifest.velocities) ? manifest.velocities : [];

        const imageData = context.createImageData(manifest.width, manifest.height);
        const emitFrame = (frameIndex) => {
            const offset = frameIndex * frameSize;
            paintReplayFrame(imageData.data, frameBytes, offset, frameSize);
            context.putImageData(imageData, 0, 0);

            if (onFrame) {
                const c = centroids[frameIndex];
                const v = velocities[frameIndex];
                const vx = Array.isArray(v) ? v[0] : 0;
                const vy = Array.isArray(v) ? v[1] : 0;
                const prevIndex = (frameIndex - 1 + frameCount) % frameCount;
                onFrame({
                    frameIndex,
                    frameCount,
                    centroidX: Array.isArray(c) ? c[0] : 0,
                    centroidY: Array.isArray(c) ? c[1] : 0,
                    vx,
                    vy,
                    speed: Math.hypot(vx, vy),
                    heading: Math.atan2(vy, vx),
                    frameData: frameBytes.subarray(frameIndex * frameSize, (frameIndex + 1) * frameSize),
                    prevFrameData: frameBytes.subarray(prevIndex * frameSize, (prevIndex + 1) * frameSize),
                    width: manifest.width,
                    height: manifest.height,
                });
            }
        };

        emitFrame(0);
        stage.classList.add("is-live");

        const fps = Math.max(manifest.fps, 1);
        const start = performance.now();
        const tick = (now) => {
            if (cancelled) {
                return;
            }
            const elapsedSeconds = (now - start) / 1000;
            const frameIndex = Math.floor(elapsedSeconds * fps) % frameCount;
            emitFrame(frameIndex);
            animationFrame = window.requestAnimationFrame(tick);
        };

        animationFrame = window.requestAnimationFrame(tick);
    }
}

function setupLiveAnatomy(root, genotype) {
    const fieldCanvas = root.querySelector('[data-anatomy="field"]');
    const deltaCanvas = root.querySelector('[data-anatomy="delta"]');
    const kernelCanvas = root.querySelector('[data-anatomy="kernel"]');

    if (!fieldCanvas && !deltaCanvas && !kernelCanvas) return null;

    const fieldCtx = fieldCanvas ? prepareCanvas(fieldCanvas, 128, 128) : null;
    const deltaCtx = deltaCanvas ? prepareCanvas(deltaCanvas, 128, 128) : null;
    const kernelCtx = kernelCanvas ? prepareCanvas(kernelCanvas, 128, 128) : null;

    const fieldImageData = fieldCtx?.createImageData(128, 128);
    const deltaImageData = deltaCtx?.createImageData(128, 128);

    if (kernelCtx) {
        const kernelData = computeLeniaKernel(genotype, 128);
        const kernelImageData = kernelCtx.createImageData(128, 128);
        paintReplayFrame(kernelImageData.data, kernelData, 0, 128 * 128);
        kernelCtx.putImageData(kernelImageData, 0, 0);
    }

    return (t) => {
        if (!t.frameData) return;

        if (fieldCtx && fieldImageData) {
            paintReplayFrame(fieldImageData.data, t.frameData, 0, t.width * t.height);
            fieldCtx.putImageData(fieldImageData, 0, 0);
        }

        if (deltaCtx && deltaImageData && t.prevFrameData) {
            paintDeltaFrame(deltaImageData.data, t.frameData, t.prevFrameData, t.width * t.height);
            deltaCtx.putImageData(deltaImageData, 0, 0);
        }
    };
}

function computeLeniaKernel(genotype, size) {
    const R = Number(genotype.R) || 13;
    const rScales = Array.isArray(genotype.r) ? genotype.r : [1];
    const aArrays = Array.isArray(genotype.a) ? genotype.a : [[0.5]];
    const wArrays = Array.isArray(genotype.w) ? genotype.w : [[0.15]];
    const bArrays = Array.isArray(genotype.b) ? genotype.b : [[1]];

    const cx = size / 2;
    const cy = size / 2;
    const output = new Uint8Array(size * size);
    let maxVal = 0;
    const raw = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dist = Math.hypot(x - cx, y - cy) / R;
            let total = 0;

            for (let k = 0; k < rScales.length; k++) {
                const rk = Number(rScales[k]) || 1;
                const rNorm = dist / rk;
                const bumps = Array.isArray(aArrays[k]) ? aArrays[k] : [];
                const widths = Array.isArray(wArrays[k]) ? wArrays[k] : [];
                const weights = Array.isArray(bArrays[k]) ? bArrays[k] : [];

                for (let i = 0; i < bumps.length; i++) {
                    const a = Number(bumps[i]) || 0;
                    const w = Number(widths[i]) || 0.15;
                    const b = Number(weights[i]) || 1;
                    total += b * Math.exp(-((rNorm - a) ** 2) / (2 * w * w));
                }
            }

            const idx = y * size + x;
            raw[idx] = total;
            if (total > maxVal) maxVal = total;
        }
    }

    if (maxVal > 0) {
        for (let i = 0; i < raw.length; i++) {
            output[i] = Math.round((raw[i] / maxVal) * 255);
        }
    }

    return output;
}

function paintDeltaFrame(output, current, prev, pixelCount) {
    for (let i = 0; i < pixelCount; i++) {
        const delta = current[i] - prev[i];
        const mapped = clamp(Math.round(delta * 2 + 128), 0, 255);
        const lookupIdx = mapped * 4;
        const outIdx = i * 4;
        output[outIdx] = DELTA_LOOKUP[lookupIdx];
        output[outIdx + 1] = DELTA_LOOKUP[lookupIdx + 1];
        output[outIdx + 2] = DELTA_LOOKUP[lookupIdx + 2];
        output[outIdx + 3] = 255;
    }
}

function buildDeltaLookup() {
    const bg = [11, 5, 16];
    const cool = [68, 136, 255];
    const warm = [255, 136, 68];
    const output = new Uint8ClampedArray(256 * 4);

    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let r, g, b;
        if (t < 0.5) {
            const blend = 1 - t * 2;
            r = mixChannel(bg[0], cool[0], blend);
            g = mixChannel(bg[1], cool[1], blend);
            b = mixChannel(bg[2], cool[2], blend);
        } else {
            const blend = (t - 0.5) * 2;
            r = mixChannel(bg[0], warm[0], blend);
            g = mixChannel(bg[1], warm[1], blend);
            b = mixChannel(bg[2], warm[2], blend);
        }
        const idx = i * 4;
        output[idx] = r;
        output[idx + 1] = g;
        output[idx + 2] = b;
        output[idx + 3] = 255;
    }
    return output;
}

function renderListMessage(title, body) {
    gridRoot.innerHTML = `
        <div class="compendium-empty">
            <strong>${escapeHtml(title)}</strong><br />
            ${escapeHtml(body)}
        </div>
    `;
}

function renderDetailMessage(title, body) {
    detailRoot.innerHTML = `
        <div class="compendium-empty">
            <strong>${escapeHtml(title)}</strong><br />
            ${escapeHtml(body)}
        </div>
    `;
}

function metricCard(label, value) {
    return `
        <div class="metric-card">
            <span class="metric-label">${escapeHtml(label)}</span>
            <span class="metric-value">${escapeHtml(formatMetricValue(value))}</span>
        </div>
    `;
}

function resolveTelemetry(telemetry, metrics) {
    if (telemetry && typeof telemetry === "object") {
        return {
            centroid: telemetry.centroid ?? { x: 0.5, y: 0.5 },
            trail: Array.isArray(telemetry.trail) ? telemetry.trail : [],
            vx: Number(telemetry.vx ?? 0),
            vy: Number(telemetry.vy ?? 0),
            speed: Number(telemetry.speed ?? 0),
            headingRad: Number(telemetry.headingRad ?? 0),
        };
    }
    if (!metrics || typeof metrics !== "object") {
        return null;
    }

    const vx = Number(metrics.velocity_x ?? metrics.velocityX ?? 0);
    const vy = Number(metrics.velocity_y ?? metrics.velocityY ?? 0);
    const speed = Number(metrics.center_velocity ?? metrics.centerVelocity ?? Math.hypot(vx, vy));
    const headingRad = Number(metrics.heading_rad ?? metrics.headingRad ?? (speed > 0 ? Math.atan2(vy, vx) : 0));
    const centerX = clamp(0.5 + Math.cos(headingRad) * 0.08, 0.12, 0.88);
    const centerY = clamp(0.5 - Math.sin(headingRad) * 0.08, 0.12, 0.88);
    const trail = [3, 2, 1].map((step) => ({
        x: clamp(centerX - vx * 10 * step, 0.08, 0.92),
        y: clamp(centerY + vy * 10 * step, 0.08, 0.92),
    }));

    return {
        centroid: { x: centerX, y: centerY },
        trail,
        vx,
        vy,
        speed,
        headingRad,
    };
}

function normalizeEntry(entry) {
    return {
        ...entry,
        baseConfig: entry.baseConfig ?? entry.base_config ?? null,
        searchConfig: entry.searchConfig ?? entry.search_config ?? null,
        isStable: entry.isStable ?? entry.is_stable ?? false,
        runId: entry.runId ?? entry.run_id ?? null,
        runName: entry.runName ?? entry.run_name ?? null,
        campaignId: entry.campaignId ?? entry.campaign_id ?? null,
        recordedAt: entry.recordedAt ?? entry.recorded_at ?? null,
        metrics: normalizeMetricSummary(entry.metrics),
        media: normalizeMedia(entry.media),
        telemetry: normalizeTelemetryPayload(entry.telemetry),
    };
}

function normalizeDetail(detail) {
    return {
        ...detail,
        runId: detail.runId ?? detail.run_id ?? null,
        runName: detail.runName ?? detail.run_name ?? null,
        campaignId: detail.campaignId ?? detail.campaign_id ?? null,
        recordedAt: detail.recordedAt ?? detail.recorded_at ?? null,
        publishedAt: detail.publishedAt ?? detail.published_at ?? null,
        sourceDb: detail.sourceDb ?? detail.source_db ?? null,
        artifactSource: detail.artifactSource ?? detail.artifact_source ?? null,
        filtersPassed: detail.filtersPassed ?? detail.filters_passed ?? null,
        media: normalizeMedia(detail.media),
        telemetry: normalizeTelemetryPayload(detail.telemetry),
        creature: normalizeCreature(detail.creature ?? {}),
    };
}

function normalizeCreature(creature) {
    return {
        ...creature,
        ownerId: creature.ownerId ?? creature.owner_id ?? null,
        scoreWeights: creature.scoreWeights ?? creature.score_weights ?? null,
        configHash: creature.configHash ?? creature.config_hash ?? null,
    };
}

function normalizeMedia(media) {
    if (!media || typeof media !== "object") {
        return null;
    }
    return {
        ...media,
        posterPath: media.posterPath ?? media.poster_path ?? null,
        replayPath: media.replayPath ?? media.replay_path ?? null,
        anatomy: media.anatomy
            ? {
                  fieldPath: media.anatomy.fieldPath ?? media.anatomy.field_path ?? media.anatomy.field ?? null,
                  deltaPath: media.anatomy.deltaPath ?? media.anatomy.delta_path ?? media.anatomy.delta ?? null,
                  neighborPath: media.anatomy.neighborPath ?? media.anatomy.neighbor_path ?? media.anatomy.neighbor ?? null,
                  kernelPath: media.anatomy.kernelPath ?? media.anatomy.kernel_path ?? media.anatomy.kernel ?? null,
              }
            : null,
    };
}

function normalizeTelemetryPayload(telemetry) {
    if (!telemetry || typeof telemetry !== "object") {
        return null;
    }
    return {
        centroid: telemetry.centroid ?? { x: 0.5, y: 0.5 },
        trail: Array.isArray(telemetry.trail) ? telemetry.trail : [],
        vx: Number(telemetry.vx ?? 0),
        vy: Number(telemetry.vy ?? 0),
        speed: Number(telemetry.speed ?? 0),
        headingRad: Number(telemetry.headingRad ?? telemetry.heading_rad ?? 0),
    };
}

function normalizeMetricSummary(metrics) {
    if (!metrics || typeof metrics !== "object") {
        return null;
    }
    return {
        centerVelocity: Number(metrics.centerVelocity ?? metrics.center_velocity ?? 0),
        displacement: Number(metrics.displacement ?? 0),
        pathLength: Number(metrics.pathLength ?? metrics.path_length ?? 0),
        gyration: Number(metrics.gyration ?? 0),
        occupancyMean: Number(metrics.occupancyMean ?? metrics.occupancy_mean ?? 0),
        velocityX: Number(metrics.velocityX ?? metrics.velocity_x ?? 0),
        velocityY: Number(metrics.velocityY ?? metrics.velocity_y ?? 0),
        headingRad: Number(metrics.headingRad ?? metrics.heading_rad ?? 0),
        translationRatio: Number(metrics.translationRatio ?? metrics.translation_ratio ?? 0),
    };
}

function resolveSortFromLocation(release) {
    const url = new URL(window.location.href);
    const explicit = normalizeSortKey(url.searchParams.get("sort"));
    return explicit ?? defaultSortForRelease(release);
}

function defaultSortForRelease(release) {
    const id = String(release?.id ?? "").toLowerCase();
    const label = String(release?.label ?? "").toLowerCase();
    if (id.includes("mover") || id.includes("glider") || label.includes("motion-biased") || label.includes("glider")) {
        return "glider";
    }
    return "score";
}

function normalizeSortKey(value) {
    switch (String(value ?? "").toLowerCase()) {
        case "score":
        case "glider":
        case "speed":
        case "displacement":
        case "translation":
        case "gyration":
        case "name":
            return String(value).toLowerCase();
        default:
            return null;
    }
}

function sortEntries(entries, sortKey) {
    const sorted = [...entries];
    sorted.sort((left, right) => {
        const primary = compareBySort(left, right, sortKey);
        if (primary !== 0) return primary;

        const scoreDelta = numberOrZero(right.score) - numberOrZero(left.score);
        if (scoreDelta !== 0) return scoreDelta;

        return String(left.name ?? left.id ?? "").localeCompare(String(right.name ?? right.id ?? ""));
    });
    return sorted;
}

function compareBySort(left, right, sortKey) {
    switch (sortKey) {
        case "glider":
            return numberOrZero(entryGliderness(right)) - numberOrZero(entryGliderness(left));
        case "speed":
            return numberOrZero(entrySpeed(right)) - numberOrZero(entrySpeed(left));
        case "displacement":
            return numberOrZero(entryMetric(right, "displacement")) - numberOrZero(entryMetric(left, "displacement"));
        case "translation":
            return numberOrZero(entryMetric(right, "translationRatio")) - numberOrZero(entryMetric(left, "translationRatio"));
        case "gyration":
            return numberOrZero(entryMetric(left, "gyration")) - numberOrZero(entryMetric(right, "gyration"));
        case "name":
            return String(left.name ?? left.id ?? "").localeCompare(String(right.name ?? right.id ?? ""));
        case "score":
        default:
            return numberOrZero(right.score) - numberOrZero(left.score);
    }
}

function entryMetric(entry, key) {
    const metrics = entry.metrics ?? null;
    if (metrics && Number.isFinite(metrics[key])) {
        return metrics[key];
    }
    if (key === "translationRatio" && metrics) {
        const path = Number(metrics.pathLength ?? 0);
        return path > 1e-9 ? Number(metrics.displacement ?? 0) / path : 0;
    }
    return 0;
}

function entrySpeed(entry) {
    const metricSpeed = entryMetric(entry, "centerVelocity");
    if (metricSpeed > 0) return metricSpeed;
    return Number(entry.telemetry?.speed ?? 0);
}

function entryGliderness(entry) {
    const speed = entrySpeed(entry);
    const gyration = Math.max(entryMetric(entry, "gyration"), 1);
    const translation = Math.max(entryMetric(entry, "translationRatio"), 0);
    return (speed * Math.max(translation, 0.5)) / Math.sqrt(gyration);
}

function tileMetricBadge(entry) {
    switch (currentSort) {
        case "glider":
            return `glide ${formatNumberish(entryGliderness(entry), 5)}`;
        case "speed":
            return `v ${formatNumberish(entrySpeed(entry), 4)}`;
        case "displacement":
            return `disp ${formatNumberish(entryMetric(entry, "displacement"), 3)}`;
        case "translation":
            return `ratio ${formatNumberish(entryMetric(entry, "translationRatio"), 3)}`;
        case "gyration":
            return `g ${formatNumberish(entryMetric(entry, "gyration"), 1)}`;
        case "name":
            return `score ${formatNumber(entry.score, 3)}`;
        case "score":
        default:
            return formatNumber(entry.score, 3);
    }
}

function numberOrZero(value) {
    return Number.isFinite(value) ? value : 0;
}

function formatNumberish(value, digits) {
    return typeof value === "number" && Number.isFinite(value)
        ? value.toFixed(digits)
        : "—";
}

function formatNumberList(values, digits) {
    if (!Array.isArray(values) || values.length === 0) {
        return "—";
    }
    return values.map((value) => formatNumberish(Number(value), digits)).join(", ");
}

function formatNestedNumberList(values, digits) {
    if (!Array.isArray(values) || values.length === 0) {
        return "—";
    }
    return values
        .map((row) => `[${formatNumberList(Array.isArray(row) ? row : [], digits)}]`)
        .join(" ");
}

function formatCentroid(centroid) {
    if (!centroid || typeof centroid !== "object") {
        return "—";
    }
    return `${formatNumberish(Number(centroid.x), 3)}, ${formatNumberish(Number(centroid.y), 3)}`;
}

function formatAnatomyAvailability(anatomy) {
    if (!anatomy || typeof anatomy !== "object") {
        return "none";
    }
    const labels = [
        anatomy.fieldPath ? "field" : null,
        anatomy.deltaPath ? "delta" : null,
        anatomy.neighborPath ? "neighbor" : null,
        anatomy.kernelPath ? "kernel" : null,
    ].filter(Boolean);
    return labels.length ? labels.join(", ") : "none";
}

function formatMomentDensity(metrics) {
    if (!metrics || typeof metrics !== "object") {
        return "—";
    }
    const mass = metrics.moment_mass ?? metrics.momentMass;
    const volume = metrics.moment_volume ?? metrics.momentVolume;
    const density = metrics.moment_density ?? metrics.momentDensity;
    if (typeof density === "number" && Number.isFinite(density)) {
        return density.toFixed(4);
    }
    if (
        typeof mass === "number" &&
        Number.isFinite(mass) &&
        typeof volume === "number" &&
        Number.isFinite(volume) &&
        volume > 0
    ) {
        return (mass / volume).toFixed(4);
    }
    return "—";
}

function formatMetricValue(value) {
    if (typeof value === "number") {
        return formatNumber(value, 4);
    }
    if (typeof value === "boolean") {
        return value ? "yes" : "no";
    }
    if (value == null || value === "") {
        return "—";
    }
    return String(value);
}

function formatNumber(value, digits) {
    return typeof value === "number" && Number.isFinite(value)
        ? value.toFixed(digits)
        : "—";
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

function resolveManifestHref(path) {
    return new URL(path, manifestUrl).toString();
}

function prepareCanvas(canvas, width, height) {
    if (!canvas) {
        return null;
    }
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return canvas.getContext("2d", { alpha: false });
}

function paintReplayFrame(output, source, offset, frameSize) {
    for (let index = 0; index < frameSize; index += 1) {
        const value = source[offset + index] ?? 0;
        const sourceIndex = value * 4;
        const targetIndex = index * 4;
        output[targetIndex] = SPECTRUM_LOOKUP[sourceIndex];
        output[targetIndex + 1] = SPECTRUM_LOOKUP[sourceIndex + 1];
        output[targetIndex + 2] = SPECTRUM_LOOKUP[sourceIndex + 2];
        output[targetIndex + 3] = 255;
    }
}

function buildSpectrumLookup() {
    const output = new Uint8ClampedArray(256 * 4);
    for (let value = 0; value < 256; value += 1) {
        const target = value * 4;
        if (value <= DISPLAY_FLOOR_BYTE) {
            output[target] = 0;
            output[target + 1] = 0;
            output[target + 2] = 0;
            output[target + 3] = 255;
            continue;
        }

        const normalized = (value - DISPLAY_FLOOR_BYTE) / (255 - DISPLAY_FLOOR_BYTE);
        const corrected = Math.pow(normalized, 0.92);
        const scaled = corrected * (LENIA_SPECTRUM.length - 1);
        const lower = Math.floor(scaled);
        const upper = Math.min(lower + 1, LENIA_SPECTRUM.length - 1);
        const blend = scaled - lower;
        const base = LENIA_SPECTRUM[lower];
        const tip = LENIA_SPECTRUM[upper];

        output[target] = mixChannel(base[0], tip[0], blend);
        output[target + 1] = mixChannel(base[1], tip[1], blend);
        output[target + 2] = mixChannel(base[2], tip[2], blend);
        output[target + 3] = 255;
    }
    return output;
}

function mixChannel(start, end, t) {
    return Math.round(start + (end - start) * t);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
}
