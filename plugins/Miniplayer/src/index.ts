import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import "./miniplayer.native";
import {
  openMiniplayerWindow as openWindowNative,
  closeWindow,
  sendIPC,
} from "./miniplayer.native";
import ColorThief from "colorthief";

let lyricsMap: Map<number, string> = new Map();
const colorThief = new ColorThief();
let currentCoverColors: { primary: string; accent: string } = {
  primary: "#ff6b35",
  accent: "#ff8c42",
};

export const unloads = new Set<LunaUnload>();

unloads.add(() => {
  closeWindow();
});

let openWindowButton: HTMLButtonElement = document.createElement("button");
openWindowButton.innerText = "Open Miniplayer";
openWindowButton.addEventListener("click", async () => {
  await openWindowNative();
  // Send initial state after a short delay to ensure window is ready
  setTimeout(sendInitialState, 100);
});
openWindowButton.style = `
    border: none;
    background-color: gray;
    border-radius: 4px;
    color: white;
    position: relative;
    padding: 6px 20px;
    cursor: pointer;
    width: auto;
    margin-left: 8px;
    margin-top: 4px;
`;
openWindowButton.addEventListener("mouseenter", () => {
  openWindowButton.style.backgroundColor = "darkgray";
});
openWindowButton.addEventListener("mouseleave", () => {
  openWindowButton.style.backgroundColor = "gray";
});

async function start() {
  const _searchAndLinksElement = Array.from(
    document.getElementsByTagName("div"),
  ).find((el) => el.className.includes("_fixedNavigation"));
  if (!_searchAndLinksElement) return setTimeout(start, 1000);

  _searchAndLinksElement.appendChild(openWindowButton);

  unloads.add(() => {
    _searchAndLinksElement.removeChild(openWindowButton);
  });

  initialLyricsLoad();
}

async function sendInitialState() {
  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) return;

  let title = await mediaItem.title();
  let artist = await mediaItem.artist();
  let coverUrl = await mediaItem.coverUrl();
  let lyrics = await mediaItem.lyrics();
  let album = await mediaItem
    .album()
    .then(async (album) =>
      album ? (await album.title()) || "Unknown Album" : "Unknown Album",
    );
  let songLength = await mediaItem.duration;
  let year = await mediaItem.releaseDate();
  let yearString = (await year?.getFullYear().toString()) || "Unknown Year";

  // Extract colors from current cover before sending initial state
  if (coverUrl) {
    const coverImg = new Image();

    await new Promise<void>((resolve) => {
      coverImg.onload = () => {
        try {
          const dominantColor = colorThief.getColor(coverImg) as [
            number,
            number,
            number,
          ];
          const palette = colorThief.getPalette(coverImg, 2) as [
            number,
            number,
            number,
          ][];

          const primaryRgb = dominantColor;
          const accentRgb = palette[1] || palette[0];

          currentCoverColors = {
            primary: `rgb(${primaryRgb[0]}, ${primaryRgb[1]}, ${primaryRgb[2]})`,
            accent: `rgb(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]})`,
          };
        } catch (err) {
          console.error("Error extracting colors:", err);
        }
        resolve();
      };

      coverImg.onerror = () => {
        resolve(); // Continue even if image fails to load
      };

      // Set timeout to prevent blocking forever
      setTimeout(() => resolve(), 500);

      coverImg.src = coverUrl;
    });
  }

  sendIPC(
    "miniplayer.update",
    JSON.stringify({
      title: title || "Unknown Title",
      artist: artist || "Unknown Artist",
      coverUrl: coverUrl || "",
      lyrics: lyrics || "",
      lyricsLine: "",
      songLength: songLength || 0,
      songProgress: 0,
      album: album || "Unknown Album",
      year: yearString || "Unknown Year",
      colors: currentCoverColors,
    }),
  );
}

async function initialLyricsLoad() {
  let mediaItem = await MediaItem.fromPlaybackContext();

  if (!mediaItem) return;

  const lyrics = await mediaItem.lyrics();
  if (!lyrics || !lyrics.subtitles) {
    lyricsMap = new Map();
    return;
  }

  const map = new Map<number, string>();
  for (const line of lyrics.subtitles.split("\n")) {
    const [timePart, textPart] = line.split("]");
    if (!textPart) continue;
    const [min, sec] = timePart.replace("[", "").split(":").map(Number);
    const timeInSec = Math.floor(min * 60 + sec);
    map.set(timeInSec, textPart.trim());
  }

  lyricsMap = map;
}

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
  if (!mediaItem) return;

  const lyrics = await mediaItem.lyrics();
  if (!lyrics || !lyrics.subtitles) {
    lyricsMap = new Map();
  } else {
    const map = new Map<number, string>();
    for (const line of lyrics.subtitles.split("\n")) {
      const [timePart, textPart] = line.split("]");
      if (!textPart) continue;
      const [min, sec] = timePart.replace("[", "").split(":").map(Number);
      const timeInSec = Math.floor(min * 60 + sec);
      map.set(timeInSec, textPart.trim());
    }
    lyricsMap = map;
  }

  // Extract colors from cover (runs in main window, no CORS issues)
  const coverUrl = await mediaItem.coverUrl();
  if (coverUrl) {
    const coverImg = new Image();
    // No need for crossOrigin in main window context

    coverImg.onload = () => {
      try {
        const dominantColor = colorThief.getColor(coverImg) as [
          number,
          number,
          number,
        ];
        const palette = colorThief.getPalette(coverImg, 2) as [
          number,
          number,
          number,
        ][];

        const primaryRgb = dominantColor;
        const accentRgb = palette[1] || palette[0];

        currentCoverColors = {
          primary: `rgb(${primaryRgb[0]}, ${primaryRgb[1]}, ${primaryRgb[2]})`,
          accent: `rgb(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]})`,
        };
      } catch (err) {
        console.error("Error extracting colors:", err);
        // Keep default colors on error
      }
    };

    coverImg.onerror = () => {
      console.debug("Could not load cover image for color extraction");
      // Keep default colors on error
    };

    coverImg.src = coverUrl;
  }
});

start();

function getClosestTime(currentTime: number): number | null {
  let closest: number | null = null;
  let maxTime = -Infinity;

  for (const [time] of lyricsMap) {
    if (time <= currentTime && time > maxTime) {
      maxTime = time;
      closest = time;
    }
  }

  return closest;
}

ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
  const signal = data.signal;
  if (signal !== "media.currenttime") return;
  const currentTime = Math.floor(Number(data.time));
  const closest = getClosestTime(currentTime);
  let line: string | undefined = "";
  if (closest !== null) {
    line = lyricsMap.get(closest);
  }

  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) return;
  let title = await mediaItem.title();
  let artist = await mediaItem.artist();
  let coverUrl = await mediaItem.coverUrl();
  let lyrics = await mediaItem.lyrics();
  let album = await mediaItem
    .album()
    .then(async (album) =>
      album ? (await album.title()) || "Unknown Album" : "Unknown Album",
    );
  let songLength = await mediaItem.duration;
  let songProgress = data.time;
  let year = await mediaItem.releaseDate();
  let yearString = (await year?.getFullYear().toString()) || "Unknown Year";

  sendIPC(
    "miniplayer.update",
    JSON.stringify({
      title: title || "Unknown Title",
      artist: artist || "Unknown Artist",
      coverUrl: coverUrl || "",
      lyrics: lyrics || "",
      lyricsLine: line || "No lyrics available",
      songLength: songLength || 0,
      songProgress: songProgress || 0,
      album: album || "Unknown Album",
      year: yearString || "Unknown Year",
      colors: currentCoverColors,
    }),
  );
});

ipcRenderer.on(unloads, "miniplayer.playercontrolsFE", (data) => {
  switch (data.action) {
    case "skip": {
      PlayState.next();
      break;
    }

    case "previous": {
      PlayState.previous();
      break;
    }

    case "togglePlay": {
      PlayState.playing ? PlayState.pause() : PlayState.play();
      break;
    }

    case "seek": {
      const seekTime = data.seekTime;
      if (typeof seekTime === "number") {
        PlayState.seek(seekTime);
      }
      break;
    }

    case "volume": {
      const volume = data.volume;
      if (typeof volume === "number") {
        ipcRenderer.send(
          "player.message",
          `{"command":"media.volume","volume":${volume}}`,
        );
      }
      break;
    }
  }
});
