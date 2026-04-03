import type { LunaUnload } from "@luna/core";
import { MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import {
  clamp,
  getCoverColorsFromMediaItem,
  getSafeLocalStorage,
  isQuotaExceededError,
  sleep,
} from "@jxnxsdev/utils";
import { analyse } from "./analyser.native";

export const unloads = new Set<LunaUnload>();

import { settings } from "./Setttings";
export { Settings } from "./Setttings";

type ItemData = {
  id: any;
  downloadLocation: string;
  hasDownloadFinished?: boolean;
  wasAnalyzed?: boolean;
  timeline?: number[];
  values?: number[][];
  lastTimelineIndex?: number;
};

type CachedAnalyzedData = {
  timeline: number[];
  values: number[][];
};

const RECENT_SONG_HISTORY_LIMIT = 200;
const CACHE_STORAGE_KEY = "AudioVisualiser.analysedAudioCache.v1";
const HISTORY_STORAGE_KEY = "AudioVisualiser.recentSongs.v1";
const FOOTER_POSITION_MARKER = "audioVisualiserManagedPosition";
const analysedAudioCache = new Map<string, CachedAnalyzedData>();
const recentPlayedSongIds: string[] = [];
let persistCacheTimeout: ReturnType<typeof setTimeout> | null = null;
let attachedFooter: HTMLElement | null = null;
let originalFooterInlinePosition: string | null = null;

function getSongCacheKey(songId: any) {
  return String(songId);
}

function downsampleCachedData(
  cached: CachedAnalyzedData,
  stride: number,
): CachedAnalyzedData {
  if (stride <= 1) return cached;

  const timeline: number[] = [];
  const values: number[][] = [];

  for (let i = 0; i < cached.timeline.length; i += stride) {
    timeline.push(cached.timeline[i]);
    values.push(cached.values[i]);
  }

  if (timeline.length === 0 && cached.timeline.length > 0) {
    timeline.push(cached.timeline[0]);
    values.push(cached.values[0]);
  }

  return { timeline, values };
}

function persistAnalyzedAudioCache() {
  try {
    const localStorageRef = getSafeLocalStorage();
    if (!localStorageRef) return;

    const persistedEntries: [string, CachedAnalyzedData][] = [];
    const seenSongIds = new Set<string>();

    for (let i = recentPlayedSongIds.length - 1; i >= 0; i--) {
      const songId = recentPlayedSongIds[i];
      if (seenSongIds.has(songId)) continue;
      seenSongIds.add(songId);

      const cached = analysedAudioCache.get(songId);
      if (!cached) continue;
      persistedEntries.push([songId, cached]);
    }

    const persistedHistory = recentPlayedSongIds.slice(
      -RECENT_SONG_HISTORY_LIMIT,
    );

    let maxSongs = persistedEntries.length;
    let stride = 1;

    while (true) {
      const trimmedEntries = persistedEntries
        .slice(0, maxSongs)
        .map(
          ([songId, cached]) =>
            [songId, downsampleCachedData(cached, stride)] as [
              string,
              CachedAnalyzedData,
            ],
        );

      try {
        localStorageRef.setItem(
          CACHE_STORAGE_KEY,
          JSON.stringify(trimmedEntries),
        );
        localStorageRef.setItem(
          HISTORY_STORAGE_KEY,
          JSON.stringify(persistedHistory),
        );
        break;
      } catch (error) {
        if (!isQuotaExceededError(error)) {
          throw error;
        }

        if (maxSongs > 1) {
          maxSongs = Math.max(1, Math.floor(maxSongs * 0.7));
          continue;
        }

        if (stride < 64) {
          stride *= 2;
          continue;
        }

        localStorageRef.setItem(CACHE_STORAGE_KEY, "[]");
        localStorageRef.setItem(
          HISTORY_STORAGE_KEY,
          JSON.stringify(persistedHistory),
        );
        console.warn(
          "[AudioVisualiser] Persisted cache exceeded storage quota and was trimmed to empty.",
        );
        break;
      }
    }
  } catch (error) {
    console.warn("[AudioVisualiser] Failed to persist analyzed cache:", error);
  }
}

function scheduleCachePersistence() {
  if (persistCacheTimeout !== null) {
    clearTimeout(persistCacheTimeout);
  }

  persistCacheTimeout = setTimeout(() => {
    persistCacheTimeout = null;
    persistAnalyzedAudioCache();
  }, 400);
}

function restorePersistedAnalyzedAudioCache() {
  try {
    const localStorageRef = getSafeLocalStorage();
    if (!localStorageRef) return;

    const rawHistory = localStorageRef.getItem(HISTORY_STORAGE_KEY);
    if (rawHistory) {
      const parsedHistory = JSON.parse(rawHistory);
      if (Array.isArray(parsedHistory)) {
        for (const songId of parsedHistory.slice(-RECENT_SONG_HISTORY_LIMIT)) {
          recentPlayedSongIds.push(String(songId));
        }
      }
    }

    const rawCache = localStorageRef.getItem(CACHE_STORAGE_KEY);
    if (rawCache) {
      const parsedCache = JSON.parse(rawCache) as [
        string,
        CachedAnalyzedData,
      ][];
      if (Array.isArray(parsedCache)) {
        for (const entry of parsedCache) {
          const songId = entry?.[0];
          const cached = entry?.[1];

          if (
            typeof songId !== "string" ||
            !cached ||
            !Array.isArray(cached.timeline) ||
            !Array.isArray(cached.values)
          ) {
            continue;
          }

          analysedAudioCache.set(songId, {
            timeline: cached.timeline,
            values: cached.values,
          });
        }
      }
    }
  } catch (error) {
    console.warn("[AudioVisualiser] Failed to restore analyzed cache:", error);
  }
}

restorePersistedAnalyzedAudioCache();

let currentFile: ItemData | null = null;
let nextFile: ItemData | null = null;

let currentPlayTime = 0;
let lastPlaybackTime = 0;
let lastPlaybackUpdate = 0;

let albumArtColor = "rgb(51, 255, 238)";
let currentVisualiserColor = settings.staticColor;

const visContainer = document.createElement("div");
visContainer.style.position = "absolute";
visContainer.style.top = "0";
visContainer.style.left = "0";
visContainer.style.width = "100%";
visContainer.style.height = "100%";
visContainer.style.display = "flex";
visContainer.style.alignItems = "flex-end";
visContainer.style.justifyContent = "stretch";
visContainer.style.pointerEvents = "none";
visContainer.style.zIndex = "1";
visContainer.style.borderRadius = "inherit";
visContainer.style.overflow = "hidden";

let bars: HTMLDivElement[] = [];
let lastMagnitudes: number[] = [];
let targetMagnitudes = new Array(8).fill(0);
let displayTargetMagnitudes = new Array(8).fill(0);
let renderedScales: number[] = [];
let renderedOpacities: number[] = [];
let renderedGlowIntensities: number[] = [];
let lastFrameTime = 0;
let lastSampleTime = 0;
let lastAppliedColorMode = settings.colorMode;
let lastAlbumArtTrackId: string | null = null;
let peak = 50;

function getAppliedContainerOpacity() {
  if (settings.hideWhenPaused && !PlayState.playing) return "0";
  return `${clamp(settings.visualiserOpacity, 0, 100) / 100}`;
}

function getColorModeColor() {
  if (settings.colorMode === "albumArt") return albumArtColor;
  return settings.staticColor;
}

function applyBarStyle() {
  const glowPx = clamp(settings.glowStrength, 0, 40);

  for (const bar of bars) {
    bar.style.backgroundColor = currentVisualiserColor;
    bar.style.backgroundImage = "none";
    bar.style.border = "none";
    bar.style.boxShadow = "none";

    if (settings.barStyle === "rounded") {
      bar.style.borderRadius = "10px 10px 0 0";
      continue;
    }

    if (settings.barStyle === "sharp") {
      bar.style.borderRadius = "0";
      continue;
    }

    if (settings.barStyle === "capsule") {
      bar.style.borderRadius = "999px";
      continue;
    }

    if (settings.barStyle === "glow") {
      bar.style.borderRadius = "10px 10px 0 0";
      bar.style.boxShadow = `0 0 ${glowPx}px ${currentVisualiserColor}`;
      continue;
    }

    if (settings.barStyle === "gradient") {
      bar.style.borderRadius = "10px 10px 0 0";
      bar.style.backgroundImage = `linear-gradient(to top, ${currentVisualiserColor}, ${settings.gradientEndColor})`;
      continue;
    }

    if (settings.barStyle === "segmented") {
      bar.style.borderRadius = "8px 8px 0 0";
      bar.style.backgroundImage = `repeating-linear-gradient(to top, ${currentVisualiserColor} 0 8px, transparent 8px 12px)`;
      continue;
    }

    if (settings.barStyle === "outline") {
      bar.style.borderRadius = "8px 8px 0 0";
      bar.style.backgroundColor = "transparent";
      bar.style.border = `2px solid ${currentVisualiserColor}`;
    }
  }
}

function setVisualiserColor(nextColor: string) {
  if (currentVisualiserColor === nextColor) return;

  currentVisualiserColor = nextColor;
  renderedGlowIntensities.fill(-1);
  applyBarStyle();
}

function rebuildBars() {
  for (const bar of bars) {
    bar.remove();
  }

  bars = [];

  const count = clamp(Math.floor(settings.barCount), 2, 128);
  settings.barCount = count;
  visContainer.style.gap = `${clamp(settings.barGap, 0, 20)}px`;

  for (let i = 0; i < count; i++) {
    const bar = document.createElement("div");
    bar.style.flex = "1 1 0";
    bar.style.height = "100%";
    bar.style.transform = "scaleY(0)";
    bar.style.transformOrigin = settings.growFromTop
      ? "center top"
      : "center bottom";
    bar.style.willChange = "transform, opacity";
    bar.style.transition = "none";
    bar.style.backgroundColor = currentVisualiserColor;
    bar.style.opacity = "0";
    visContainer.appendChild(bar);
    bars.push(bar);
  }

  lastMagnitudes = new Array(count).fill(0);
  renderedScales = new Array(count).fill(-1);
  renderedOpacities = new Array(count).fill(-1);
  renderedGlowIntensities = new Array(count).fill(-1);
  applyBarStyle();
}

export function applyVisualiserSettings() {
  settings.barCount = clamp(Math.floor(settings.barCount), 2, 128);
  settings.barGap = clamp(Math.floor(settings.barGap), 0, 20);
  settings.smoothing = clamp(Math.floor(settings.smoothing), 1, 100);
  settings.sensitivity = clamp(Math.floor(settings.sensitivity), 20, 400);
  settings.peakDecay = clamp(Math.floor(settings.peakDecay), 90, 100);
  settings.minHeight = clamp(Math.floor(settings.minHeight), 0, 40);
  settings.maxHeight = clamp(Math.floor(settings.maxHeight), 20, 100);
  settings.glowStrength = clamp(Math.floor(settings.glowStrength), 0, 40);
  settings.slopeAggression = clamp(
    Math.floor(settings.slopeAggression),
    0,
    100,
  );
  settings.visualiserOpacity = clamp(
    Math.floor(settings.visualiserOpacity),
    0,
    100,
  );

  if (settings.minHeight > settings.maxHeight) {
    settings.minHeight = settings.maxHeight;
  }

  const previousColorMode = lastAppliedColorMode;
  lastAppliedColorMode = settings.colorMode;
  setVisualiserColor(getColorModeColor());

  if (bars.length !== settings.barCount) {
    rebuildBars();
  }

  visContainer.style.alignItems = settings.growFromTop
    ? "flex-start"
    : "flex-end";
  visContainer.style.opacity = getAppliedContainerOpacity();
  visContainer.style.gap = `${settings.barGap}px`;

  const transformOrigin = settings.growFromTop ? "center top" : "center bottom";
  for (const bar of bars) {
    bar.style.transformOrigin = transformOrigin;
  }

  applyBarStyle();
  displayTargetMagnitudes = getDisplayMagnitudes(targetMagnitudes);

  if (settings.colorMode === "albumArt" && previousColorMode !== "albumArt") {
    refreshAlbumArtColorFromCurrentTrack(true).catch(console.error);
  }
}

let pendingCoverColorToken = 0;
async function updateAlbumArtColor(item: MediaItem) {
  const token = ++pendingCoverColorToken;
  try {
    const coverColors = await getCoverColorsFromMediaItem(item, {
      readable: true,
      minLuminance: 80,
    });
    if (token !== pendingCoverColorToken || !coverColors) return;

    albumArtColor = coverColors.primary;
    setVisualiserColor(getColorModeColor());
  } catch (error) {
    console.error("Failed to extract album art color:", error);
  }
}

async function refreshAlbumArtColorFromCurrentTrack(force = false) {
  if (settings.colorMode !== "albumArt") return;

  const item = await MediaItem.fromPlaybackContext();
  if (!item) return;

  const trackId = getSongCacheKey(item.id);
  if (!force && trackId === lastAlbumArtTrackId) return;

  lastAlbumArtTrackId = trackId;
  await updateAlbumArtColor(item);
}

function attachVisualiser() {
  const footer = document.getElementById("footerPlayer");
  if (!footer) return;

  if (!footer.contains(visContainer)) {
    const computedPosition = window.getComputedStyle(footer).position;
    if (computedPosition === "static") {
      originalFooterInlinePosition = footer.style.position;
      footer.style.position = "relative";
      footer.dataset[FOOTER_POSITION_MARKER] = "1";
    }

    attachedFooter = footer;
    footer.appendChild(visContainer);
  }
}

function applyCachedAnalysis(file: ItemData): boolean {
  const cacheKey = getSongCacheKey(file.id);
  const cached = analysedAudioCache.get(cacheKey);
  if (!cached) return false;

  file.timeline = cached.timeline;
  file.values = cached.values;
  file.lastTimelineIndex = 0;
  file.wasAnalyzed = true;
  return true;
}

function pruneAnalyzedAudioCache() {
  const recentSet = new Set(recentPlayedSongIds);

  for (const cachedSongId of analysedAudioCache.keys()) {
    if (!recentSet.has(cachedSongId)) {
      analysedAudioCache.delete(cachedSongId);
    }
  }

  scheduleCachePersistence();
}

function markSongPlayed(songId: any) {
  recentPlayedSongIds.push(getSongCacheKey(songId));
  if (recentPlayedSongIds.length > RECENT_SONG_HISTORY_LIMIT) {
    recentPlayedSongIds.shift();
  }

  pruneAnalyzedAudioCache();
}

function getClosestMagnitude(
  file: ItemData,
  timeMs: number,
): number[] | undefined {
  const timeline = file.timeline;
  const values = file.values;
  if (!timeline || !values || timeline.length === 0) return undefined;

  let index = clamp(file.lastTimelineIndex ?? 0, 0, timeline.length - 1);

  while (index + 1 < timeline.length && timeline[index + 1] <= timeMs) {
    index++;
  }

  while (index > 0 && timeline[index] > timeMs) {
    index--;
  }

  const nextIndex = Math.min(index + 1, timeline.length - 1);
  const currentDistance = Math.abs(timeline[index] - timeMs);
  const nextDistance = Math.abs(timeline[nextIndex] - timeMs);
  const chosenIndex = nextDistance < currentDistance ? nextIndex : index;

  file.lastTimelineIndex = chosenIndex;

  return values[chosenIndex];
}

function resampleMagnitudes(values: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];
  if (values.length === 0) return new Array(targetCount).fill(0);
  if (targetCount === 1)
    return [values.reduce((sum, v) => sum + v, 0) / values.length];

  const result = new Array(targetCount).fill(0);
  const scale = (values.length - 1) / (targetCount - 1);

  for (let i = 0; i < targetCount; i++) {
    const sourceIndex = i * scale;
    const left = Math.floor(sourceIndex);
    const right = Math.min(Math.ceil(sourceIndex), values.length - 1);
    const mix = sourceIndex - left;
    const leftValue = values[left] ?? 0;
    const rightValue = values[right] ?? leftValue;
    result[i] = leftValue + (rightValue - leftValue) * mix;
  }

  return result;
}

function applyMirrorMode(values: number[], totalBars: number): number[] {
  if (!settings.mirrorMode) return values;

  const halfCount = Math.ceil(totalBars / 2);
  const leftSide = resampleMagnitudes(values, halfCount);

  if (totalBars % 2 === 0) {
    return [...leftSide, ...[...leftSide].reverse()];
  }

  return [...leftSide, ...leftSide.slice(0, -1).reverse()];
}

function applySlope(values: number[]): number[] {
  if (!settings.slopeTowardCenter || values.length <= 1) return values;

  const center = (values.length - 1) / 2;
  const maxDistance = Math.max(center, 1);
  const aggression = clamp(settings.slopeAggression, 0, 100) / 100;

  return values.map((value, index) => {
    const normalizedDistance = Math.abs(index - center) / maxDistance;
    const multiplier = Math.max(0, 1 - normalizedDistance * aggression);
    return value * multiplier;
  });
}

function getDisplayMagnitudes(magnitudes: number[]): number[] {
  const targetCount = clamp(Math.floor(settings.barCount), 2, 128);
  const sensitivityScale = clamp(settings.sensitivity, 20, 400) / 100;
  const scaledMagnitudes = magnitudes.map((value) => value * sensitivityScale);
  const mirrored = applyMirrorMode(scaledMagnitudes, targetCount);
  const resized = settings.mirrorMode
    ? mirrored
    : resampleMagnitudes(scaledMagnitudes, targetCount);
  return applySlope(resized);
}

function sampleCurrentMagnitudes(nowMs: number) {
  if (!currentFile?.timeline || !currentFile.wasAnalyzed) return;
  if (!PlayState.playing) return;

  if (lastSampleTime === 0) {
    lastSampleTime = nowMs;
  }

  if (nowMs - lastSampleTime < settings.updateInterval) return;

  const elapsed = (nowMs - lastPlaybackUpdate) / 1000;
  currentPlayTime = lastPlaybackTime + elapsed;

  const timeMs = Math.floor(currentPlayTime * 1000);
  const magnitudes = getClosestMagnitude(currentFile, timeMs);

  lastSampleTime = nowMs;

  if (!magnitudes) return;

  targetMagnitudes = magnitudes.map((value) =>
    Number.isFinite(value) ? value : 0,
  );
  displayTargetMagnitudes = getDisplayMagnitudes(targetMagnitudes);
}

function animate(nowMs: number) {
  const frameDeltaMs = lastFrameTime > 0 ? nowMs - lastFrameTime : 16.67;
  lastFrameTime = nowMs;

  sampleCurrentMagnitudes(nowMs);

  const nextOpacity = getAppliedContainerOpacity();
  if (visContainer.style.opacity !== nextOpacity) {
    visContainer.style.opacity = nextOpacity;
  }

  let maxTarget = 1;
  for (let i = 0; i < displayTargetMagnitudes.length; i++) {
    const value = displayTargetMagnitudes[i];
    if (value > maxTarget) maxTarget = value;
  }

  if (maxTarget > peak) peak = maxTarget;
  peak *= clamp(settings.peakDecay, 90, 100) / 100;

  if (peak < 1) peak = 1;

  const baseSmoothingFactor = Math.max(0.02, 1 / (settings.smoothing * 0.2 + 1));
  const frameScale = Math.max(frameDeltaMs, 1) / 16.67;
  const smoothingFactor = 1 - Math.pow(1 - baseSmoothingFactor, frameScale);
  const minHeight = clamp(settings.minHeight, 0, 40);
  const maxHeightLimit = clamp(settings.maxHeight, 20, 100);

  for (let i = 0; i < bars.length; i++) {
    const target = displayTargetMagnitudes[i] ?? 0;
    lastMagnitudes[i] += (target - lastMagnitudes[i]) * smoothingFactor;

    const normalizedHeight = Math.min(lastMagnitudes[i] / peak, 1) * 100;
    const height = clamp(normalizedHeight, minHeight, maxHeightLimit);
    const scale = height / 100;
    if (Math.abs(renderedScales[i] - scale) > 0.002) {
      bars[i].style.transform = `scaleY(${scale})`;
      renderedScales[i] = scale;
    }

    const intensity = Math.min(height / 100, 1);
    if (settings.barStyle !== "gradient" && settings.barStyle !== "outline") {
      bars[i].style.backgroundColor = currentVisualiserColor;
    }

    if (
      settings.barStyle === "glow" &&
      Math.abs(renderedGlowIntensities[i] - intensity) > 0.02
    ) {
      bars[i].style.boxShadow =
        `0 0 ${clamp(settings.glowStrength, 0, 40) * (0.25 + intensity)}px ${currentVisualiserColor}`;
      renderedGlowIntensities[i] = intensity;
    }

    const opacity = 0.2 + 0.8 * intensity;
    if (Math.abs(renderedOpacities[i] - opacity) > 0.01) {
      bars[i].style.opacity = `${opacity}`;
      renderedOpacities[i] = opacity;
    }
  }

  requestAnimationFrame(animate);
}

rebuildBars();
applyVisualiserSettings();
unloads.add(() => {
  visContainer.remove();

  if (
    attachedFooter?.dataset[FOOTER_POSITION_MARKER] === "1" &&
    originalFooterInlinePosition !== null
  ) {
    attachedFooter.style.position = originalFooterInlinePosition;
    delete attachedFooter.dataset[FOOTER_POSITION_MARKER];
  }

  attachedFooter = null;
  originalFooterInlinePosition = null;
});
requestAnimationFrame(animate);

export function updateIntervalTiming() {
  lastSampleTime = 0;
}

MediaItem.onMediaTransition(unloads, async (item) => {
  attachVisualiser();
  lastAlbumArtTrackId = getSongCacheKey(item.id);
  updateAlbumArtColor(item).catch(console.error);
  markSongPlayed(item.id);

  if (!currentFile || currentFile.id !== item.id) {
    if (nextFile && nextFile.id === item.id) {
      currentFile = nextFile;
      currentFile.lastTimelineIndex = 0;
      nextFile = null;
    } else {
      const downloadLocation = await getDownloadPathForItem(item);
      currentFile = { id: item.id, downloadLocation };
      if (!applyCachedAnalysis(currentFile)) {
        downloadAndAnalyze(currentFile).catch(console.error);
      }
    }
  }

  const nextItem = await PlayState.nextMediaItem();
  if (nextItem && (!nextFile || nextFile.id !== nextItem.id)) {
    const downloadLocation = await getDownloadPathForItem(nextItem);
    nextFile = { id: nextItem.id, downloadLocation };
    if (!applyCachedAnalysis(nextFile)) {
      downloadAndAnalyze(nextFile).catch(console.error);
    }
  }
});

ipcRenderer.on(unloads, "client.playback.playersignal", (data) => {
  if (data.signal !== "media.currenttime") return;

  lastPlaybackTime = Number(data.time);
  lastPlaybackUpdate = performance.now();
});

async function getDownloadPathForItem(item: MediaItem): Promise<string> {
  const basePath = "/MusicVis/Cache";
  return `${basePath}/${item.id}.flac`;
}

async function downloadAndAnalyze(file: ItemData) {
  if (applyCachedAnalysis(file)) {
    return;
  }

  await fileDownload(file);
  file.hasDownloadFinished = true;

  const analysedData = await analyse(file.downloadLocation);
  const entries = Array.from(analysedData.entries()).sort(
    (left, right) => left[0] - right[0],
  );

  file.timeline = entries.map((entry) => entry[0]);
  file.values = entries.map((entry) => entry[1]);
  file.lastTimelineIndex = 0;
  file.wasAnalyzed = true;

  analysedAudioCache.set(getSongCacheKey(file.id), {
    timeline: file.timeline,
    values: file.values,
  });

  scheduleCachePersistence();
}

async function fileDownload(file: ItemData) {
  const item = await MediaItem.fromId(file.id);
  if (!item) return;

  await item.download(file.downloadLocation);

  while (true) {
    const progress = await item.downloadProgress();
    if (!progress) break;
    if (!progress.total || !progress.downloaded) continue;
    if (progress.downloaded >= progress.total) break;
    await sleep(100);
  }
}
