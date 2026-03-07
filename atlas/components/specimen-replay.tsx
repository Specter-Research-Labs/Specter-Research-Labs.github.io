"use client";

import { useEffect, useRef, useState } from "react";

type SpecimenReplayProps = {
  replaySrc: string;
  className?: string;
};

type ReplayManifest = {
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  framesPath: string;
  palette: string;
};

const LENIA_SPECTRUM = [
  [5, 4, 10],
  [124, 245, 255],
  [80, 123, 255],
  [191, 55, 255],
  [255, 58, 175],
  [255, 113, 56],
  [255, 204, 69]
] as const;

const SPECTRUM_LOOKUP = buildSpectrumLookup();

export function SpecimenReplay({ replaySrc, className }: SpecimenReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    setReady(false);

    async function load() {
      try {
        const replayResponse = await fetch(replaySrc, { cache: "force-cache" });
        if (!replayResponse.ok) {
          throw new Error(`Failed to load replay manifest: ${replayResponse.status}`);
        }
        const manifest = (await replayResponse.json()) as ReplayManifest;
        const framesSrc = resolveReplayAsset(manifest.framesPath, replaySrc);
        const framesResponse = await fetch(framesSrc, { cache: "force-cache" });
        if (!framesResponse.ok) {
          throw new Error(`Failed to load replay frames: ${framesResponse.status}`);
        }

        const frameBytes = new Uint8Array(await framesResponse.arrayBuffer());
        if (cancelled) {
          return;
        }

        const frameSize = manifest.width * manifest.height;
        const frameCount = Math.min(manifest.frameCount, Math.floor(frameBytes.length / Math.max(frameSize, 1)));
        if (frameSize <= 0 || frameCount <= 0) {
          throw new Error("Replay payload is empty.");
        }

        const context = prepareCanvas(canvasRef.current, manifest.width, manifest.height);
        if (!context) {
          return;
        }

        const imageData = context.createImageData(manifest.width, manifest.height);
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const drawFrame = (frameIndex: number) => {
          const offset = frameIndex * frameSize;
          paintFrame(imageData.data, frameBytes, offset, frameSize);
          context.putImageData(imageData, 0, 0);
        };

        drawFrame(prefersReducedMotion ? Math.floor(frameCount / 2) : 0);
        setReady(true);

        if (prefersReducedMotion) {
          return;
        }

        const fps = Math.max(manifest.fps, 1);
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) {
            return;
          }
          const elapsedSeconds = (now - start) / 1000;
          const frameIndex = Math.floor(elapsedSeconds * fps) % frameCount;
          drawFrame(frameIndex);
          animationFrame = window.requestAnimationFrame(tick);
        };

        animationFrame = window.requestAnimationFrame(tick);
      } catch (error) {
        console.error(error);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [replaySrc]);

  return (
    <div className={`specimen-stage-replay${ready ? " is-ready" : ""}${className ? ` ${className}` : ""}`}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

function prepareCanvas(canvas: HTMLCanvasElement | null, width: number, height: number) {
  if (!canvas) {
    return null;
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas.getContext("2d", { alpha: false });
}

function paintFrame(output: Uint8ClampedArray, source: Uint8Array, offset: number, frameSize: number) {
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
    const normalized = value / 255;
    const corrected = Math.pow(normalized, 0.88);
    const scaled = corrected * (LENIA_SPECTRUM.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(lower + 1, LENIA_SPECTRUM.length - 1);
    const blend = scaled - lower;
    const base = LENIA_SPECTRUM[lower];
    const tip = LENIA_SPECTRUM[upper];
    const target = value * 4;

    output[target] = mixChannel(base[0], tip[0], blend);
    output[target + 1] = mixChannel(base[1], tip[1], blend);
    output[target + 2] = mixChannel(base[2], tip[2], blend);
    output[target + 3] = 255;
  }
  return output;
}

function mixChannel(start: number, end: number, t: number) {
  return Math.round(start + (end - start) * t);
}

function resolveReplayAsset(assetPath: string, replaySrc: string) {
  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }
  if (assetPath.startsWith("/")) {
    return assetPath;
  }

  const replayUrl = new URL(replaySrc, window.location.origin);
  if (assetPath.startsWith("media/")) {
    const [publishedRoot] = replayUrl.pathname.split("/media/");
    return `${publishedRoot}/${assetPath}`;
  }

  return new URL(assetPath, replayUrl).toString();
}
