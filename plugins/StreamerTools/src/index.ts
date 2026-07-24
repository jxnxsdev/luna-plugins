import type { LunaUnload } from "@luna/core";
import { settings } from "./Settings";
export { Settings } from "./Settings";

import { MediaItem, PlayState } from "@luna/lib";
import { messageDataType } from "./datatype";
import {
  getMediaItemSnapshot,
  getCoverColorsFromMediaItem,
} from "@jxnxsdev/utils";

import {
  startWebServer,
  stopWebServer,
  sendSocketMessage,
} from "./webserver.native";

export let unloads = new Set<LunaUnload>();

let intervalId: NodeJS.Timeout | null = null;

async function start() {
  await startWebServer(settings.webServerPort, settings.webServerAccessScope);

  intervalId = setInterval(async () => {
    await sendDataUpdate();
  }, 1000);
}

start().catch((error) => {
  console.error("Failed to start Streamer Tools plugin:", error);
});

unloads.add(async () => {
  await stopWebServer();
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
});

async function sendDataUpdate() {
  const mediaItem = await MediaItem.fromPlaybackContext();
  if (!mediaItem) {
    return;
  }

  const nextMediaItem = await PlayState.nextMediaItem();
  const nextMediaItemSnapshot = nextMediaItem
    ? await getMediaItemSnapshot(nextMediaItem)
    : undefined;

  const snapshot = await getMediaItemSnapshot(mediaItem);

  const colors = await getCoverColorsFromMediaItem(mediaItem);
  const data: messageDataType = {
    title: snapshot.title,
    artist: snapshot.artist,
    album: snapshot.album,
    coverURL: snapshot.coverUrl,
    playing: PlayState.playing,
    progress: Math.max(0, Math.floor(Number(PlayState.currentTime ?? 0))),
    duration: snapshot.duration,
    nextMediaItem: nextMediaItemSnapshot
      ? {
          title: nextMediaItemSnapshot.title,
          artist: nextMediaItemSnapshot.artist,
          coverURL: nextMediaItemSnapshot.coverUrl,
        }
      : undefined,
    primaryColor: colors?.primary,
    secondaryColor: colors?.accent,
  };

  await sendSocketMessage("playbackUpdate", data);
}
