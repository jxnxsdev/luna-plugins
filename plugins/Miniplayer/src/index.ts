import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, Quality, ipcRenderer } from "@luna/lib";
import {
  buildLyricMap,
  getCoverColorsFromMediaItem,
  getLyricLineAtTime,
  getMediaItemSnapshot,
} from "@jxnxsdev/utils";
import "./miniplayer.native";
import {
  openMiniplayerWindow as openWindowNative,
  closeWindow,
  sendIPC,
  openTaskbarWidgetWindow,
  closeTaskbarWidgetWindow,
  sendTaskbarIPC,
  setTaskbarWidgetHorizontalOffset as setTaskbarWidgetHorizontalOffsetNative,
  setTaskbarWidgetWidth as setTaskbarWidgetWidthNative,
} from "./miniplayer.native";
import { settings } from "./Settings";

let lyricsMap: Map<number, string> = new Map();
let currentCoverColors: { primary: string; accent: string } = {
  primary: "#ff6b35",
  accent: "#ff8c42",
};

export const unloads = new Set<LunaUnload>();
export { Settings } from "./Settings";

const isWindowsClient =
  typeof navigator !== "undefined" &&
  /win/i.test(navigator.userAgent || navigator.platform || "");

function getTaskbarQualityInfo() {
  const audioQuality = PlayState.playbackContext.actualAudioQuality;
  const quality = Quality.fromAudioQuality(audioQuality);
  const qualityName = quality?.name ?? "Unknown";
  const normalizedName = qualityName.toLowerCase();

  let qualityColor = "#9ca3af";
  if (
    normalizedName.includes("max") ||
    normalizedName.includes("master") ||
    normalizedName.includes("mqa")
  ) {
    qualityColor = "#d4af37";
  } else if (
    normalizedName.includes("hifi") ||
    normalizedName.includes("lossless")
  ) {
    qualityColor = "#00d8d8";
  }

  return {
    qualityName,
    qualityColor,
  };
}

function getTaskbarDisplaySettings() {
  return {
    showProgressBar: settings.taskbarShowProgressBar,
    showCover: settings.taskbarShowCover,
    showSongName: settings.taskbarShowSongName,
    showArtistName: settings.taskbarShowArtistName,
    showAlbumName: settings.taskbarShowAlbumName,
    showSongQuality: settings.taskbarShowSongQuality,
    showYear: settings.taskbarShowYear,
    showTime: settings.taskbarShowTime,
    showPlayState: settings.taskbarShowPlayState,
  };
}

function sendTaskbarWidgetUpdate(
  snapshot: {
    title: string;
    artist: string;
    coverUrl: string;
    duration: number;
    album: string;
    year: string;
  },
  songProgress: number,
) {
  const { qualityName, qualityColor } = getTaskbarQualityInfo();

  sendTaskbarIPC(
    "miniplayer.taskbar.update",
    JSON.stringify({
      title: snapshot.title,
      artist: snapshot.artist,
      coverUrl: snapshot.coverUrl,
      songLength: snapshot.duration,
      songProgress,
      album: snapshot.album,
      year: snapshot.year,
      progressColor: currentCoverColors.primary,
      qualityName,
      qualityColor,
      playing: PlayState.playing,
      display: getTaskbarDisplaySettings(),
    }),
  );
}

unloads.add(() => {
  closeWindow();
  closeTaskbarWidgetWindow();
});

export async function setTaskbarWidgetEnabled(enabled: boolean) {
  if (!isWindowsClient) return;

  if (enabled) {
    await openTaskbarWidgetWindow();
    setTimeout(sendInitialState, 100);
    return;
  }

  await closeTaskbarWidgetWindow();
}

export function setTaskbarWidgetHorizontalOffset(offset: number) {
  if (!isWindowsClient) return;
  setTaskbarWidgetHorizontalOffsetNative(offset);
}

export function setTaskbarWidgetWidth(width: number) {
  if (!isWindowsClient) return;
  setTaskbarWidgetWidthNative(width);
}

export async function refreshTaskbarWidget() {
  if (!isWindowsClient || !settings.addTaskbarWidget) return;
  await sendInitialState();
}

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

  setTaskbarWidgetHorizontalOffsetNative(
    settings.taskbarWidgetHorizontalOffset,
  );
  setTaskbarWidgetWidthNative(settings.taskbarWidgetWidth);

  if (isWindowsClient && settings.addTaskbarWidget) {
    await openTaskbarWidgetWindow();
    setTimeout(sendInitialState, 100);
  }

  initialLyricsLoad();
}

async function sendInitialState() {
  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) return;
  const snapshot = await getMediaItemSnapshot(mediaItem);

  // Extract colors from current cover before sending initial state
  if (snapshot.coverUrl) {
    try {
      const colors = await getCoverColorsFromMediaItem(mediaItem, {
        paletteSize: 2,
        accentIndex: 1,
      });
      if (colors) {
        currentCoverColors = {
          primary: colors.primary,
          accent: colors.accent,
        };
      }
    } catch (err) {
      console.error("Error extracting colors:", err);
    }
  }

  sendIPC(
    "miniplayer.update",
    JSON.stringify({
      title: snapshot.title,
      artist: snapshot.artist,
      coverUrl: snapshot.coverUrl,
      lyrics: snapshot.lyrics,
      lyricsLine: "",
      songLength: snapshot.duration,
      songProgress: 0,
      album: snapshot.album,
      year: snapshot.year,
      colors: currentCoverColors,
    }),
  );

  sendTaskbarWidgetUpdate(snapshot, 0);
}

async function initialLyricsLoad() {
  let mediaItem = await MediaItem.fromPlaybackContext();

  if (!mediaItem) return;

  const lyrics = await mediaItem.lyrics();
  if (!lyrics || !lyrics.subtitles) {
    lyricsMap = new Map();
    return;
  }

  lyricsMap = buildLyricMap(lyrics.subtitles);
}

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
  if (!mediaItem) return;

  const lyrics = await mediaItem.lyrics();
  if (!lyrics || !lyrics.subtitles) {
    lyricsMap = new Map();
  } else {
    lyricsMap = buildLyricMap(lyrics.subtitles);
  }

  // Extract colors from cover (runs in main window, no CORS issues)
  try {
    const colors = await getCoverColorsFromMediaItem(mediaItem, {
      paletteSize: 2,
      accentIndex: 1,
    });
    if (colors) {
      currentCoverColors = {
        primary: colors.primary,
        accent: colors.accent,
      };
    }
  } catch (err) {
    console.error("Error extracting colors:", err);
  }
});

start();

ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
  const signal = data.signal;
  if (signal !== "media.currenttime") return;
  const currentTime = Math.floor(Number(data.time));
  const line = getLyricLineAtTime(lyricsMap, currentTime) || "";

  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) return;
  const snapshot = await getMediaItemSnapshot(mediaItem);
  const songProgress = data.time;

  sendIPC(
    "miniplayer.update",
    JSON.stringify({
      title: snapshot.title,
      artist: snapshot.artist,
      coverUrl: snapshot.coverUrl,
      lyrics: snapshot.lyrics,
      lyricsLine: line || "No lyrics available",
      songLength: snapshot.duration,
      songProgress: songProgress || 0,
      album: snapshot.album,
      year: snapshot.year,
      colors: currentCoverColors,
    }),
  );

  sendTaskbarWidgetUpdate(snapshot, songProgress || 0);
});

PlayState.onState(unloads, async () => {
  if (!isWindowsClient || !settings.addTaskbarWidget) return;

  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) return;
  const snapshot = await getMediaItemSnapshot(mediaItem);
  const currentTime = Math.floor(Number(PlayState.currentTime ?? 0));

  sendTaskbarWidgetUpdate(snapshot, currentTime);
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
