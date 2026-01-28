import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import { analyse } from "./analyser.native";
import { clear } from "console";

export const unloads = new Set<LunaUnload>();

import { settings } from "./Setttings";
export { Settings } from "./Setttings";

type ItemData = {
  id: any;
  downloadLocation: string;
  hasDownloadFinished?: boolean;
  wasAnalyzed?: boolean;
  data?: Map<number, number[]>;
};

let currentFile: ItemData | null = null;
let nextFile: ItemData | null = null;

let currentPlayTime = 0;
let lastPlaybackTime = 0;
let lastPlaybackUpdate = 0;

const visContainer = document.createElement("div");
visContainer.style.position = "absolute";
visContainer.style.top = "0";
visContainer.style.left = "0";
visContainer.style.width = "100%";
visContainer.style.height = "100%";
visContainer.style.display = "flex";
visContainer.style.alignItems = "flex-end";
visContainer.style.justifyContent = "space-between";
visContainer.style.pointerEvents = "none";
visContainer.style.opacity = "0.3";
visContainer.style.zIndex = "1";
visContainer.style.borderRadius = "inherit";
visContainer.style.overflow = "hidden";

const bars: HTMLDivElement[] = [];
for (let i = 0; i < 8; i++) {
  const bar = document.createElement("div");
  bar.style.width = "12.5%";
  bar.style.height = "0%";
  bar.style.backgroundColor = "rgb(51, 255, 238)";
  bar.style.transition = "height 0.1s linear";
  visContainer.appendChild(bar);
  bars.push(bar);
}

unloads.add(() => visContainer.remove());

function attachVisualiser() {
  const footer = document.getElementById("footerPlayer");
  if (!footer) return;

  if (!footer.contains(visContainer)) {
    footer.style.position = "relative";
    footer.appendChild(visContainer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClosestMagnitude(
  data: Map<number, number[]>,
  timeMs: number,
): number[] | undefined {
  let closestKey: number | undefined;
  let smallestDiff = Infinity;

  for (const key of data.keys()) {
    const diff = Math.abs(key - timeMs);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestKey = key;
    }
  }

  return closestKey !== undefined ? data.get(closestKey) : undefined;
}

let lastMagnitudes = new Array(8).fill(0);
let targetMagnitudes = new Array(8).fill(0);
let peak = 50;

function animate() {
  const maxTarget = Math.max(...targetMagnitudes);
  if (maxTarget > peak) peak = maxTarget;
  peak *= 0.98;

  for (let i = 0; i < 8; i++) {
    lastMagnitudes[i] += (targetMagnitudes[i] - lastMagnitudes[i]) * 0.25;

    const height = Math.min(lastMagnitudes[i] / peak, 1) * 100;
    bars[i].style.height = `${height}%`;

    const intensity = Math.min(height / 100, 1);
    bars[i].style.backgroundColor = `rgba(51, 255, 238, ${
      0.3 + 0.7 * intensity
    })`;
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

let visInterval: NodeJS.Timeout;

async function createVisInterval() {
  visInterval = setInterval(() => {
    if (!currentFile?.data || !currentFile.wasAnalyzed) return;
    if (!PlayState.playing) return;

    const now = performance.now();
    const elapsed = (now - lastPlaybackUpdate) / 1000;

    currentPlayTime = lastPlaybackTime + elapsed;

    const timeMs = Math.floor(currentPlayTime * 1000);
    const magnitudes = getClosestMagnitude(currentFile.data, timeMs);

    if (magnitudes) {
      targetMagnitudes = magnitudes;
    }
  }, settings.updateInterval);
}

unloads.add(() => clearInterval(visInterval));
createVisInterval();

export function updateIntervalTiming() {
  clearInterval(visInterval);
  createVisInterval();
}

MediaItem.onMediaTransition(unloads, async (item) => {
  attachVisualiser();

  if (!currentFile || currentFile.id !== item.id) {
    if (nextFile && nextFile.id === item.id) {
      currentFile = nextFile;
      nextFile = null;
    } else {
      const downloadLocation = await getDownloadPathForItem(item);
      currentFile = { id: item.id, downloadLocation };
      downloadAndAnalyze(currentFile).catch(console.error);
    }
  }

  const nextItem = await PlayState.nextMediaItem();
  if (nextItem && (!nextFile || nextFile.id !== nextItem.id)) {
    const downloadLocation = await getDownloadPathForItem(nextItem);
    nextFile = { id: nextItem.id, downloadLocation };
    downloadAndAnalyze(nextFile).catch(console.error);
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
  await fileDownload(file);
  file.hasDownloadFinished = true;

  file.data = await analyse(file.downloadLocation);
  file.wasAnalyzed = true;
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
