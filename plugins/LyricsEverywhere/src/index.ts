import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import {
    buildLyricMap,
    getLyricLineAtTime,
    getMediaItemSnapshot,
} from "@jxnxsdev/utils";
import { settings } from "./Settings";
import "./lyricsWindow.native";
import { openLyricsWindow as openWindowNative, closeWindow, sendIPC } from "./lyricsWindow.native";

export const openWindow = () => openWindowNative();

export { Settings } from "./Settings";

document.querySelectorAll("#lyewLyrics").forEach(el => el.remove());

const style = document.createElement("style");
document.head.appendChild(style);

setCatJamCompatible(settings.catjamCompatibility);

const lyricsElement = document.createElement("div");
lyricsElement.id = "lyewLyrics";
lyricsElement.textContent = "No lyrics loaded";
document.body.appendChild(lyricsElement);

export const unloads = new Set<LunaUnload>();
unloads.add(() => {
    console.log("Unloading LyricsEverywhere");
    document.querySelectorAll("#lyewLyrics").forEach(el => el.remove());
});

let lyricsMap: Map<number, string> = new Map();

async function refreshLyricsMapForMediaItem(mediaItem: MediaItem): Promise<void> {
    const lyrics = await mediaItem.lyrics();
    if (!lyrics || !lyrics.subtitles) {
        lyricsElement.textContent = "No lyrics loaded";
        lyricsElement.style.display = "none";
        lyricsMap = new Map();
        return;
    }

    lyricsElement.style.display = "block";
    lyricsElement.textContent = "...";
    lyricsMap = buildLyricMap(lyrics.subtitles);
}

initialLoad();

async function initialLoad() {
    let mediaItem = await MediaItem.fromPlaybackContext();

    if (!mediaItem) return;
    await refreshLyricsMapForMediaItem(mediaItem);
}

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
    if (!mediaItem) return;
    await refreshLyricsMapForMediaItem(mediaItem);
});

ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
    const signal = data.signal;
    if (signal !== "media.currenttime") return;
    const currentTime = Math.floor(Number(data.time));
    const line = getLyricLineAtTime(lyricsMap, currentTime);
    if (line) lyricsElement.textContent = line;
    
    if (!line || line.trim() === "") {
        lyricsElement.textContent = "...";
    }

    const mediaItem = await MediaItem.fromPlaybackContext();
    if (!mediaItem) return;
    const snapshot = await getMediaItemSnapshot(mediaItem);
    const songProgress = data.time;
    

    sendIPC("lyev.update", JSON.stringify({
        title: snapshot.title,
        artist: snapshot.artist,
        coverUrl: snapshot.coverUrl,
        lyrics: snapshot.lyrics,
        lyricsLine: line || "No lyrics available",
        songLength: snapshot.duration,
        songProgress: songProgress || 0,
    }));
});

export async function setCatJamCompatible(enabled: boolean) {
    style.textContent = enabled ? `
        #lyewLyrics {
            position: fixed;
            bottom: 100px;
            left: 20px;
            transform: none;
            background: #ffffff;
            color: #000000;
            padding: 10px 16px;
            border: 3px solid #111;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            z-index: 9999;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            white-space: normal;
            word-break: break-word;
            max-width: 50vw;
            width: fit-content;
            transition: none;
            opacity: 0.8;
            text-align: left;
        }

        #lyewLyrics::after {
            content: "";
            position: absolute;
            bottom: -10px;
            left: 20px;
            width: 0;
            height: 0;
            border: 10px solid transparent;
            border-top-color: #111;
            border-bottom: 0;
        }

        #lyewLyrics::before {
            content: "";
            position: absolute;
            bottom: -8px;
            left: 20px;
            width: 0;
            height: 0;
            border: 10px solid transparent;
            border-top-color: #ffffff;
            border-bottom: 0;
        }
    ` : `
        #lyewLyrics {
            position: fixed;
            bottom: 104px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 12px 20px;
            border: none;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            z-index: 9999;
            border-radius: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            white-space: normal;
            word-break: break-word;
            max-width: 60vw;
            width: fit-content;
            opacity: 0.9;
            text-align: center;
        }

        #lyewLyrics::before,
        #lyewLyrics::after {
            display: none;
            content: none;
        }
    `;
}

unloads.add(closeWindow);