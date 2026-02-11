import type { LunaUnload } from "@luna/core";
import { MediaItem, PlayState, getCredentials } from "@luna/lib";

import { settings } from "./Settings";
import {
  disconnectSocket,
  getIsInControl,
  getPlayStatus,
  initializeSocket,
} from "./socket.native";

export { Settings } from "./Settings";

export type Song = {
  title: string;
  artist: string;
  duration: number;
  url: string;
  tidalId: string;
  coverUrl: string;
};

export type PlayStatus = {
  isPlaying: boolean;
  playTime: number;
  currentSongIndex: number;
  playQueue: Song[];
};

export const unloads = new Set<LunaUnload>();

let intervalId: NodeJS.Timeout;
let isTickRunning = false;
let lastInControl = false;

let titleContainer: HTMLElement | null = null;
let remoteControlBanner: HTMLElement | null = null;

function ensureTitleBanner() {
  if (remoteControlBanner) return;

  titleContainer = document.querySelector<HTMLElement>('div[class^="_bar_"]');

  if (!titleContainer) return;

  titleContainer.style.position = "relative";

  remoteControlBanner = document.createElement("div");
  remoteControlBanner.innerText =
    "Discord Remote Control Active - Please do not manually play music (this will crash the app lol)";

  Object.assign(remoteControlBanner.style, {
    position: "absolute",
    top: "50%",
    pointerEvents: "none",
    translate: "50% -50%",
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text-normal, red)",
    opacity: "0.85",
    whiteSpace: "nowrap",
    display: "none",
  });

  titleContainer.appendChild(remoteControlBanner);
}

unloads.add(() => {
  disconnectSocket();
  if (intervalId) clearInterval(intervalId);
  remoteControlBanner?.remove();
});

export async function start() {
  if (!settings.discordId) return;

  console.log("Starting Discord Utils with Discord ID:", settings.discordId);

  const { token } = await getCredentials();
  initializeSocket(settings.discordId, token);

  intervalId = setInterval(async () => {
    if (isTickRunning) return;
    isTickRunning = true;

    try {
      const [isInControl, status] = await Promise.all([
        getIsInControl(),
        getPlayStatus(),
      ]);

      ensureTitleBanner();

      if (isInControl !== lastInControl && remoteControlBanner) {
        remoteControlBanner.style.display = isInControl ? "block" : "none";
        lastInControl = isInControl;
      }

      if (!isInControl) return;

      const desiredSong = status.playQueue[status.currentSongIndex];

      if (desiredSong) {
        const desiredId = desiredSong.tidalId;

        const currentItem = await MediaItem.fromPlaybackContext();
        const currentId = currentItem?.id.toString();

        if (currentId !== desiredId) {
          const newItem = await MediaItem.fromId(desiredId);
          if (newItem) {
            await newItem.play();
          }
        }
      }

      const isPlayingLocal = await PlayState.playing;
      if (status.isPlaying !== isPlayingLocal) {
        status.isPlaying ? await PlayState.play() : await PlayState.pause();
      }

      const currentTime = await PlayState.currentTime;
      if (currentTime > 0 && Math.abs(currentTime - status.playTime) > 2) {
        await PlayState.seek(status.playTime);
      }
    } finally {
      isTickRunning = false;
    }
  }, 1000);
}

start();
