(() => {
    const content = document.querySelector(".doc-content");
    if (!content) {
        return;
    }

    const parseSlides = (raw) => {
        if (!raw) {
            throw new Error("missing data-slides");
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("data-slides must be a non-empty array");
        }
        const parsePath = (value, idx, field) => {
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error("slide " + (idx + 1) + " has invalid " + field);
            }
            return value.map((step, stepIdx) => {
                if (typeof step !== "string" || !step.trim()) {
                    throw new Error(
                        "slide " +
                            (idx + 1) +
                            " has invalid " +
                            field +
                            " entry " +
                            (stepIdx + 1),
                    );
                }
                return step.trim();
            });
        };
        const parseAttemptGraph = (value, idx) => {
            if (value == null) {
                return null;
            }
            if (typeof value !== "object") {
                throw new Error("slide " + (idx + 1) + " has invalid attempt_graph");
            }
            const parseBranch = (branch, name) => {
                if (!branch || typeof branch !== "object") {
                    throw new Error(
                        "slide " + (idx + 1) + " has invalid attempt_graph." + name,
                    );
                }
                const root = typeof branch.root === "string" ? branch.root.trim() : "";
                if (!root) {
                    throw new Error(
                        "slide " + (idx + 1) + " has invalid attempt_graph." + name + ".root",
                    );
                }
                if (!Array.isArray(branch.attempts) || !branch.attempts.length) {
                    throw new Error(
                        "slide " +
                            (idx + 1) +
                            " has invalid attempt_graph." +
                            name +
                            ".attempts",
                    );
                }
                const attempts = branch.attempts.map((attempt, attemptIdx) => {
                    if (!attempt || typeof attempt !== "object") {
                        throw new Error(
                            "slide " +
                                (idx + 1) +
                                " invalid " +
                                name +
                                ".attempts[" +
                                attemptIdx +
                                "]",
                        );
                    }
                    const tactic =
                        typeof attempt.tactic === "string" ? attempt.tactic.trim() : "";
                    const outcome =
                        typeof attempt.outcome === "string"
                            ? attempt.outcome.trim()
                            : "";
                    if (!tactic || !["blocked", "failure", "success"].includes(outcome)) {
                        throw new Error(
                            "slide " +
                                (idx + 1) +
                                " invalid " +
                                name +
                                ".attempts[" +
                                attemptIdx +
                                "]",
                        );
                    }
                    return { tactic, outcome };
                });
                const continuation =
                    typeof branch.continuation === "string"
                        ? branch.continuation.trim()
                        : "";
                return { root, attempts, continuation };
            };
            return {
                wild: parseBranch(value.wild, "wild"),
                intervention: parseBranch(value.intervention, "intervention"),
            };
        };
        return parsed.map((item, idx) => {
            if (!item || typeof item !== "object") {
                throw new Error("slide " + (idx + 1) + " is not an object");
            }
            const img = typeof item.img === "string" ? item.img.trim() : "";
            if (img) {
                return {
                    mode: "image",
                    img,
                    alt: typeof item.alt === "string" ? item.alt : "",
                    label:
                        typeof item.label === "string"
                            ? item.label
                            : "slide " + (idx + 1),
                    metrics: typeof item.metrics === "string" ? item.metrics : "",
                    caption: typeof item.caption === "string" ? item.caption : "",
                    lightbox: item.lightbox !== false,
                };
            }
            const ged = Number(item.ged);
            if (!Number.isFinite(ged) || ged < 0 || ged > 1) {
                throw new Error("slide " + (idx + 1) + " has invalid ged");
            }
            const attempts = item.attempts;
            if (!attempts || typeof attempts !== "object") {
                throw new Error("slide " + (idx + 1) + " is missing attempts");
            }
            const blocked = Number(attempts.blocked ?? 0);
            const failure = Number(attempts.failure ?? 0);
            const success = Number(attempts.success ?? 0);
            for (const [name, val] of [
                ["blocked", blocked],
                ["failure", failure],
                ["success", success],
            ]) {
                if (!Number.isFinite(val) || val < 0) {
                    throw new Error(
                        "slide " + (idx + 1) + " has invalid attempts." + name,
                    );
                }
            }
            if (blocked + failure + success <= 0) {
                throw new Error("slide " + (idx + 1) + " has zero attempts");
            }
            return {
                mode: "graph",
                label:
                    typeof item.label === "string"
                        ? item.label
                        : "slide " + (idx + 1),
                metrics: typeof item.metrics === "string" ? item.metrics : "",
                caption: typeof item.caption === "string" ? item.caption : "",
                ged,
                attempts: { blocked, failure, success },
                attempt_graph: parseAttemptGraph(item.attempt_graph, idx),
                wild_path: parsePath(item.wild_path, idx, "wild_path"),
                intervention_path: parsePath(
                    item.intervention_path,
                    idx,
                    "intervention_path",
                ),
            };
        });
    };

    const initSteppers = () => {
        const steppers = Array.from(content.querySelectorAll(".ws-stepper"));
        if (!steppers.length) {
            return;
        }

        steppers.forEach((stepper, stepperIdx) => {
            const title =
                stepper.dataset.title?.trim() || "Intervention player " + (stepperIdx + 1);
            let slides = [];
            try {
                slides = parseSlides(stepper.dataset.slides || "");
            } catch (error) {
                const status = document.createElement("p");
                status.className = "doc-status error";
                status.textContent = "Stepper config error: " + error.message;
                stepper.appendChild(status);
                console.error("[ws-stepper]", error);
                return;
            }

            let current = 0;
            const header = document.createElement("div");
            header.className = "ws-stepper-header";
            const titleEl = document.createElement("div");
            titleEl.className = "ws-stepper-title";
            titleEl.textContent = title;
            const countEl = document.createElement("div");
            countEl.className = "ws-stepper-count";
            header.append(titleEl, countEl);

            const body = document.createElement("div");
            body.className = "ws-stepper-body";
            const figure = document.createElement("figure");
            figure.className = "ws-stepper-figure";
            const media = document.createElement("div");
            media.className = "ws-stepper-media";
            const image = document.createElement("img");
            const caption = document.createElement("figcaption");
            caption.className = "ws-stepper-caption";
            figure.append(media, caption);

            const panel = document.createElement("div");
            panel.className = "ws-stepper-panel";
            const controls = document.createElement("div");
            controls.className = "ws-stepper-controls";
            const prev = document.createElement("button");
            prev.className = "ws-stepper-btn";
            prev.type = "button";
            prev.textContent = "<";
            prev.setAttribute("aria-label", "Previous slide");
            prev.title = "Previous";
            const next = document.createElement("button");
            next.className = "ws-stepper-btn";
            next.type = "button";
            next.textContent = ">";
            next.setAttribute("aria-label", "Next slide");
            next.title = "Next";
            controls.append(prev, next);

            const tabs = document.createElement("div");
            tabs.className = "ws-stepper-tabs";
            const metrics = document.createElement("div");
            metrics.className = "ws-stepper-metrics";

            const tabButtons = slides.map((slide, idx) => {
                const tab = document.createElement("button");
                tab.type = "button";
                tab.className = "ws-stepper-tab";
                tab.textContent = slide.label;
                tab.addEventListener("click", () => {
                    current = idx;
                    update();
                });
                tabs.appendChild(tab);
                return tab;
            });

            panel.append(controls, tabs, metrics);
            body.append(figure, panel);

            const makePathRow = (label, steps) => {
                const row = document.createElement("div");
                row.className = "ws-path-row";
                const labelEl = document.createElement("span");
                labelEl.className = "ws-path-label";
                labelEl.textContent = label;
                row.appendChild(labelEl);
                steps.forEach((step, idx) => {
                    const node = document.createElement("span");
                    node.className = "ws-path-node";
                    node.textContent = step;
                    row.appendChild(node);
                    if (idx < steps.length - 1) {
                        const arrow = document.createElement("span");
                        arrow.className = "ws-path-arrow";
                        arrow.textContent = "->";
                        row.appendChild(arrow);
                    }
                });
                return row;
            };

            const renderFlowSvg = (wildPath, interventionPath) => {
                const width = 780;
                const height = 188;
                const laneY = { wild: 58, intervention: 132 };
                const left = 176;
                const right = 72;
                const maxSteps = Math.max(wildPath.length, interventionPath.length, 1);
                const stepGap =
                    maxSteps > 1 ? (width - left - right) / (maxSteps - 1) : 0;
                const nodeW = 112;
                const nodeH = 36;

                const svgNS = "http://www.w3.org/2000/svg";
                const wrapper = document.createElement("div");
                wrapper.className = "ws-flow-wrap";
                const svg = document.createElementNS(svgNS, "svg");
                svg.setAttribute("viewBox", "0 0 " + width + " " + height);
                svg.setAttribute("class", "ws-flow-svg");
                svg.setAttribute("role", "img");
                svg.setAttribute(
                    "aria-label",
                    "Flow graph comparing wild and intervention tactic paths",
                );
                const tooltip = document.createElement("div");
                tooltip.className = "ws-flow-tooltip";
                const markerPrefix =
                    "ws-arrow-" + Math.random().toString(36).slice(2, 10);

                const defs = document.createElementNS(svgNS, "defs");
                const addMarker = (id, cls) => {
                    const marker = document.createElementNS(svgNS, "marker");
                    marker.setAttribute("id", id);
                    marker.setAttribute("markerWidth", "8");
                    marker.setAttribute("markerHeight", "8");
                    marker.setAttribute("refX", "6");
                    marker.setAttribute("refY", "3");
                    marker.setAttribute("orient", "auto");
                    const markerPath = document.createElementNS(svgNS, "path");
                    markerPath.setAttribute("d", "M0,0 L0,6 L6,3 z");
                    markerPath.setAttribute("class", "ws-flow-arrow " + cls);
                    marker.appendChild(markerPath);
                    defs.appendChild(marker);
                };
                const wildMarkerId = markerPrefix + "-wild";
                const interventionMarkerId = markerPrefix + "-intervention";
                addMarker(wildMarkerId, "wild");
                addMarker(interventionMarkerId, "intervention");
                svg.appendChild(defs);

                const truncate = (value, maxLen) => {
                    if (value.length <= maxLen) {
                        return value;
                    }
                    return value.slice(0, maxLen - 3) + "...";
                };

                const addText = (x, y, text, className) => {
                    const node = document.createElementNS(svgNS, "text");
                    node.setAttribute("x", String(x));
                    node.setAttribute("y", String(y));
                    node.setAttribute("class", className);
                    node.textContent = text;
                    svg.appendChild(node);
                    return node;
                };

                const showTooltip = (evt, text) => {
                    tooltip.textContent = text;
                    tooltip.classList.add("is-visible");
                    const rect = wrapper.getBoundingClientRect();
                    tooltip.style.left = evt.clientX - rect.left + 10 + "px";
                    tooltip.style.top = evt.clientY - rect.top - 10 + "px";
                };

                const hideTooltip = () => {
                    tooltip.classList.remove("is-visible");
                };

                const drawLane = (path, laneName, y) => {
                    addText(18, y + 5, laneName, "ws-flow-lane-label");
                    path.forEach((step, idx) => {
                        const x = left + idx * stepGap;
                        if (idx > 0) {
                            const prevX = left + (idx - 1) * stepGap;
                            const edge = document.createElementNS(svgNS, "line");
                            edge.setAttribute("x1", String(prevX + nodeW / 2));
                            edge.setAttribute("y1", String(y));
                            edge.setAttribute("x2", String(x - nodeW / 2 - 2));
                            edge.setAttribute("y2", String(y));
                            edge.setAttribute(
                                "class",
                                "ws-flow-edge " +
                                    (laneName === "wild" ? "wild" : "intervention"),
                            );
                            edge.setAttribute(
                                "marker-end",
                                laneName === "wild"
                                    ? "url(#" + wildMarkerId + ")"
                                    : "url(#" + interventionMarkerId + ")",
                            );
                            svg.appendChild(edge);
                        }

                        const rect = document.createElementNS(svgNS, "rect");
                        rect.setAttribute("x", String(x - nodeW / 2));
                        rect.setAttribute("y", String(y - nodeH / 2));
                        rect.setAttribute("rx", "8");
                        rect.setAttribute("ry", "8");
                        rect.setAttribute("width", String(nodeW));
                        rect.setAttribute("height", String(nodeH));
                        rect.setAttribute(
                            "class",
                            "ws-flow-node " +
                                (laneName === "wild" ? "wild" : "intervention"),
                        );
                        svg.appendChild(rect);

                        const text = addText(
                            x,
                            y + 4,
                            truncate(step, 18),
                            "ws-flow-node-text",
                        );
                        text.setAttribute("text-anchor", "middle");
                        const tooltipText = laneName + ": " + step;
                        [rect, text].forEach((node) => {
                            node.style.cursor = "default";
                            node.addEventListener("mouseenter", (evt) =>
                                showTooltip(evt, tooltipText),
                            );
                            node.addEventListener("mousemove", (evt) =>
                                showTooltip(evt, tooltipText),
                            );
                            node.addEventListener("mouseleave", hideTooltip);
                        });

                        const title = document.createElementNS(svgNS, "title");
                        title.textContent = step;
                        rect.appendChild(title);
                    });
                };

                drawLane(wildPath, "wild", laneY.wild);
                drawLane(interventionPath, "intervention", laneY.intervention);

                wrapper.append(svg, tooltip);
                return wrapper;
            };

            const renderAttemptBranchLane = (branch, laneName) => {
                const width = 560;
                const rowStep = 36;
                const top = 58;
                const rootX = 90;
                const attemptX = 246;
                const terminalX = 400;
                const continuationX = 498;
                const minHeight = 190;
                const height = Math.max(minHeight, top + branch.attempts.length * rowStep + 30);

                const svgNS = "http://www.w3.org/2000/svg";
                const wrapper = document.createElement("div");
                wrapper.className = "ws-branch-wrap";
                const svg = document.createElementNS(svgNS, "svg");
                svg.setAttribute("viewBox", "0 0 " + width + " " + height);
                svg.setAttribute("class", "ws-branch-svg");
                const tooltip = document.createElement("div");
                tooltip.className = "ws-flow-tooltip";
                const markerPrefix =
                    "ws-branch-arrow-" + Math.random().toString(36).slice(2, 10);

                const defs = document.createElementNS(svgNS, "defs");
                const addMarker = (id, cls) => {
                    const marker = document.createElementNS(svgNS, "marker");
                    marker.setAttribute("id", id);
                    marker.setAttribute("markerWidth", "8");
                    marker.setAttribute("markerHeight", "8");
                    marker.setAttribute("refX", "6");
                    marker.setAttribute("refY", "3");
                    marker.setAttribute("orient", "auto");
                    const markerPath = document.createElementNS(svgNS, "path");
                    markerPath.setAttribute("d", "M0,0 L0,6 L6,3 z");
                    markerPath.setAttribute("class", "ws-branch-arrow " + cls);
                    marker.appendChild(markerPath);
                    defs.appendChild(marker);
                };
                addMarker(markerPrefix + "-blocked", "blocked");
                addMarker(markerPrefix + "-failure", "failure");
                addMarker(markerPrefix + "-success", "success");
                addMarker(markerPrefix + "-continuation", "continuation");
                svg.appendChild(defs);

                const truncate = (value, maxLen) =>
                    value.length <= maxLen ? value : value.slice(0, maxLen - 3) + "...";
                const showTooltip = (evt, text) => {
                    tooltip.textContent = text;
                    tooltip.classList.add("is-visible");
                    const rect = wrapper.getBoundingClientRect();
                    tooltip.style.left = evt.clientX - rect.left + 10 + "px";
                    tooltip.style.top = evt.clientY - rect.top - 10 + "px";
                };
                const hideTooltip = () => tooltip.classList.remove("is-visible");

                const attachHover = (node, tooltipText) => {
                    node.style.cursor = "default";
                    node.addEventListener("mouseenter", (evt) =>
                        showTooltip(evt, tooltipText),
                    );
                    node.addEventListener("mousemove", (evt) => showTooltip(evt, tooltipText));
                    node.addEventListener("mouseleave", hideTooltip);
                };

                const addNode = (x, y, text, cls, tooltipText, opts = {}) => {
                    const widthPx = opts.width || 126;
                    const heightPx = opts.height || 32;
                    const radius = opts.radius || 8;
                    const maxLen = opts.maxLen || 21;
                    const rect = document.createElementNS(svgNS, "rect");
                    rect.setAttribute("x", String(x - widthPx / 2));
                    rect.setAttribute("y", String(y - heightPx / 2));
                    rect.setAttribute("rx", String(radius));
                    rect.setAttribute("ry", String(radius));
                    rect.setAttribute("width", String(widthPx));
                    rect.setAttribute("height", String(heightPx));
                    rect.setAttribute("class", "ws-branch-node " + cls);
                    svg.appendChild(rect);

                    const nodeText = document.createElementNS(svgNS, "text");
                    nodeText.setAttribute("x", String(x));
                    nodeText.setAttribute("y", String(y + 4));
                    nodeText.setAttribute("text-anchor", "middle");
                    nodeText.setAttribute("class", "ws-branch-node-text");
                    nodeText.textContent = truncate(text, maxLen);
                    svg.appendChild(nodeText);

                    attachHover(rect, tooltipText);
                    attachHover(nodeText, tooltipText);
                };

                const addCurve = (x1, y1, x2, y2, cls, markerId, tooltipText) => {
                    const curve = Math.max(26, Math.min(82, Math.abs(x2 - x1) * 0.42));
                    const edge = document.createElementNS(svgNS, "path");
                    edge.setAttribute(
                        "d",
                        "M " +
                            x1 +
                            " " +
                            y1 +
                            " C " +
                            (x1 + curve) +
                            " " +
                            y1 +
                            ", " +
                            (x2 - curve) +
                            " " +
                            y2 +
                            ", " +
                            x2 +
                            " " +
                            y2,
                    );
                    edge.setAttribute("class", "ws-branch-edge " + cls);
                    edge.setAttribute("marker-end", "url(#" + markerId + ")");
                    attachHover(edge, tooltipText);
                    svg.appendChild(edge);
                };

                const laneLabel = document.createElementNS(svgNS, "text");
                laneLabel.setAttribute("x", "18");
                laneLabel.setAttribute("y", "22");
                laneLabel.setAttribute("class", "ws-branch-lane-label");
                laneLabel.textContent = laneName;
                svg.appendChild(laneLabel);

                const rootY = top + ((branch.attempts.length - 1) * rowStep) / 2;
                addNode(rootX, rootY, branch.root, "root", laneName + " root: " + branch.root, {
                    maxLen: 20,
                });

                const successYs = [];
                branch.attempts.forEach((attempt, idx) => {
                    const y = top + idx * rowStep;
                    const attemptTooltip =
                        laneName +
                        " attempt " +
                        (idx + 1) +
                        " (" +
                        attempt.outcome +
                        "): " +
                        attempt.tactic;
                    addCurve(
                        rootX + 62,
                        rootY,
                        attemptX - 64,
                        y,
                        attempt.outcome,
                        markerPrefix + "-" + attempt.outcome,
                        attemptTooltip,
                    );
                    addNode(
                        attemptX,
                        y,
                        attempt.tactic,
                        "attempt " + attempt.outcome,
                        attemptTooltip,
                        { maxLen: 20 },
                    );

                    if (attempt.outcome === "success") {
                        successYs.push(y);
                        return;
                    }

                    const terminalLabel =
                        attempt.outcome === "blocked" ? "blocked gate" : "dead end";
                    addCurve(
                        attemptX + 64,
                        y,
                        terminalX - 40,
                        y,
                        attempt.outcome,
                        markerPrefix + "-" + attempt.outcome,
                        laneName + " " + attempt.outcome + " terminal",
                    );
                    addNode(
                        terminalX,
                        y,
                        terminalLabel,
                        "terminal " + attempt.outcome,
                        laneName + " " + attempt.outcome + " terminal",
                        { width: 88, height: 24, maxLen: 14, radius: 6 },
                    );
                });

                if (branch.continuation && successYs.length) {
                    const contY =
                        successYs.reduce((acc, value) => acc + value, 0) / successYs.length;
                    addNode(
                        continuationX,
                        contY,
                        branch.continuation,
                        "continuation",
                        "continuation: " + branch.continuation,
                        { width: 116, maxLen: 17 },
                    );
                    successYs.forEach((successY) => {
                        addCurve(
                            attemptX + 64,
                            successY,
                            continuationX - 60,
                            contY,
                            "continuation",
                            markerPrefix + "-continuation",
                            "success continuation: " + branch.continuation,
                        );
                    });
                }

                wrapper.append(svg, tooltip);
                return wrapper;
            };

            const renderAttemptCompare = (attemptGraph) => {
                const compare = document.createElement("div");
                compare.className = "ws-detour-compare";
                compare.append(
                    renderAttemptBranchLane(attemptGraph.wild, "wild"),
                    renderAttemptBranchLane(attemptGraph.intervention, "intervention"),
                );
                return compare;
            };

            const renderGraph = (slide) => {
                const total =
                    slide.attempts.blocked + slide.attempts.failure + slide.attempts.success;

                const graph = document.createElement("div");
                graph.className = "ws-stepper-graph";

                const label = document.createElement("div");
                label.className = "ws-graph-label";
                label.textContent = slide.label;
                graph.appendChild(label);

                const summary = document.createElement("div");
                summary.className = "ws-graph-summary";

                const attemptsMetric = document.createElement("div");
                attemptsMetric.className = "ws-graph-metric";
                const attemptsTitle = document.createElement("div");
                attemptsTitle.className = "ws-graph-metric-header";
                attemptsTitle.textContent = "Attempt outcomes";
                const attemptsTrack = document.createElement("div");
                attemptsTrack.className = "ws-track";
                const attemptSegments = [
                    ["blocked", slide.attempts.blocked],
                    ["failure", slide.attempts.failure],
                    ["success", slide.attempts.success],
                ];
                attemptSegments.forEach(([kind, value]) => {
                    if (!value) {
                        return;
                    }
                    const seg = document.createElement("span");
                    seg.className = "ws-segment " + kind;
                    seg.style.width = (100 * value) / total + "%";
                    seg.title = kind + ": " + value + " of " + total;
                    attemptsTrack.appendChild(seg);
                });
                const attemptsLegend = document.createElement("div");
                attemptsLegend.className = "ws-chart-legend";
                attemptSegments.forEach(([kind, value]) => {
                    const chip = document.createElement("span");
                    chip.className = "ws-chart-chip";
                    chip.textContent = kind + " " + value;
                    attemptsLegend.appendChild(chip);
                });
                attemptsMetric.append(attemptsTitle, attemptsTrack, attemptsLegend);

                const gedMetric = document.createElement("div");
                gedMetric.className = "ws-graph-metric";
                const gedTitle = document.createElement("div");
                gedTitle.className = "ws-graph-metric-header";
                gedTitle.textContent = "Normalized GED_search";
                const gedTrack = document.createElement("div");
                gedTrack.className = "ws-track";
                const gedSegment = document.createElement("span");
                gedSegment.className = "ws-segment ged";
                gedSegment.style.width = slide.ged * 100 + "%";
                gedSegment.title = "normalized GED_search: " + slide.ged.toFixed(3);
                gedTrack.appendChild(gedSegment);
                const gedLegend = document.createElement("div");
                gedLegend.className = "ws-chart-legend";
                const gedChip = document.createElement("span");
                gedChip.className = "ws-chart-chip";
                gedChip.textContent = "value " + slide.ged.toFixed(3);
                gedLegend.appendChild(gedChip);
                gedMetric.append(gedTitle, gedTrack, gedLegend);

                summary.append(attemptsMetric, gedMetric);

                const pathBlock = document.createElement("div");
                pathBlock.className = "ws-path-block";
                const flowWrap = slide.attempt_graph
                    ? renderAttemptCompare(slide.attempt_graph)
                    : renderFlowSvg(slide.wild_path, slide.intervention_path);
                pathBlock.append(
                    flowWrap,
                    makePathRow("wild", slide.wild_path),
                    makePathRow("intervention", slide.intervention_path),
                );

                graph.append(summary, pathBlock);
                return graph;
            };

            const update = () => {
                const slide = slides[current];
                media.replaceChildren();
                if (slide.mode === "image") {
                    image.src = slide.img;
                    image.alt = slide.alt || slide.label;
                    if (!slide.lightbox) {
                        image.setAttribute("data-lightbox", "off");
                    } else {
                        image.removeAttribute("data-lightbox");
                    }
                    media.appendChild(image);
                } else {
                    media.appendChild(renderGraph(slide));
                }
                caption.textContent = slide.caption;
                metrics.textContent = slide.metrics;
                countEl.textContent = current + 1 + " / " + slides.length;
                tabButtons.forEach((tab, idx) => {
                    const active = idx === current;
                    tab.classList.toggle("is-active", active);
                    tab.setAttribute("aria-pressed", active ? "true" : "false");
                });
            };

            prev.addEventListener("click", () => {
                current = (current + slides.length - 1) % slides.length;
                update();
            });

            next.addEventListener("click", () => {
                current = (current + 1) % slides.length;
                update();
            });

            stepper.addEventListener("keydown", (event) => {
                if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    current = (current + slides.length - 1) % slides.length;
                    update();
                }
                if (event.key === "ArrowRight") {
                    event.preventDefault();
                    current = (current + 1) % slides.length;
                    update();
                }
            });

            stepper.setAttribute("tabindex", "0");
            stepper.classList.add("is-ready");
            stepper.append(header, body);
            update();
        });
    };

    const initLightbox = () => {
        const images = Array.from(content.querySelectorAll("img"));
        if (!images.length) {
            return;
        }

        const lightbox = document.createElement("div");
        lightbox.className = "image-lightbox";
        lightbox.innerHTML = `
            <div class="image-lightbox__scrim" aria-hidden="true"></div>
            <figure class="image-lightbox__frame" role="dialog" aria-modal="true" aria-label="Expanded image">
                <img class="image-lightbox__img" alt="" />
                <figcaption class="image-lightbox__caption"></figcaption>
            </figure>
        `;

        document.body.appendChild(lightbox);

        const lightboxImg = lightbox.querySelector(".image-lightbox__img");
        const lightboxCaption = lightbox.querySelector(".image-lightbox__caption");
        const lightboxFrame = lightbox.querySelector(".image-lightbox__frame");
        lightboxFrame.setAttribute("tabindex", "-1");

        let lastFocus = null;

        const setCaption = (text) => {
            const trimmed = text ? text.trim() : "";
            if (trimmed) {
                lightboxCaption.textContent = trimmed;
                lightboxCaption.style.display = "";
            } else {
                lightboxCaption.textContent = "";
                lightboxCaption.style.display = "none";
            }
        };

        const openLightbox = (img) => {
            lastFocus =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            lightboxImg.src = img.currentSrc || img.src;
            lightboxImg.alt = img.alt || "";

            const figure = img.closest("figure");
            const figcaption = figure ? figure.querySelector("figcaption") : null;
            setCaption(figcaption ? figcaption.textContent : img.alt);

            lightbox.classList.add("is-open");
            document.body.classList.add("lightbox-open");
            lightboxFrame.focus();
        };

        const closeLightbox = () => {
            lightbox.classList.remove("is-open");
            document.body.classList.remove("lightbox-open");
            lightboxImg.src = "";
            lightboxImg.alt = "";
            setCaption("");
            if (lastFocus) {
                lastFocus.focus();
            }
        };

        lightbox.addEventListener("click", (event) => {
            if (
                event.target === lightbox ||
                event.target.classList.contains("image-lightbox__scrim")
            ) {
                closeLightbox();
            }
        });

        lightboxImg.addEventListener("click", closeLightbox);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
                closeLightbox();
            }
        });

        images.forEach((img) => {
            if (img.dataset.lightbox === "off") {
                return;
            }
            img.setAttribute("role", "button");
            img.setAttribute("tabindex", "0");
            img.addEventListener("click", () => openLightbox(img));
            img.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openLightbox(img);
                }
            });
        });
    };

    initSteppers();
    initLightbox();
})();
