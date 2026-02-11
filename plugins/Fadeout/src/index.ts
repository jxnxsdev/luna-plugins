import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";

export const unloads = new Set<LunaUnload>();

let currentTrackLength = 0;
let isFadingOut = false;

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
    if (!mediaItem) return;
    isFadingOut = false;

    const fadeInDuration = 3000;
    const steps = 100;
    const stepTime = fadeInDuration / steps;

    for (let n = 0; n <= steps; n++) {
        const t = n / steps;
        const eased = 1 - (1 - t) * (1 - t);
        const volume = Math.round(100 * eased);
        await setVolume(volume);
        await new Promise(r => setTimeout(r, stepTime));
    }

    // @ts-ignore
    currentTrackLength = mediaItem.duration ?? 0;
    console.log("New track length:", currentTrackLength);
});

ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
    const signal = data.signal;
    if (signal !== "media.currenttime") return;

    const currentTime = Math.floor(Number(data.time));
    if (!currentTrackLength || currentTrackLength <= 0) return;
    if (currentTrackLength - currentTime <= 15 && !isFadingOut) {
        console.log("Fading out (15s before end)...");
        isFadingOut = true;

        const fadeOutDuration = 8_000;
        const steps = 100;
        const stepTime = fadeOutDuration / steps;

        for (let n = 0; n <= steps; n++) {
            const t = n / steps;

            const eased = Math.pow(t, 0.6);
            const volume = Math.round(100 * (1 - eased));

            await setVolume(volume);
            await new Promise(r => setTimeout(r, stepTime));
        }
        await setVolume(0);
        PlayState.next();
    }
});



async function setVolume(volume: number) {
    ipcRenderer.send("player.message", 
        `{"command":"media.volume","volume":${volume}}`
    );
}
