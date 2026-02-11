import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";

let addedElement: HTMLDivElement | null = null;
let observer: MutationObserver | null = null;
let clicks = 0;
let remainingPlayTime = 0;

function createTimeBox(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.id = "totalPlayTimeParent";
    Object.assign(wrapper.style, {
        padding: "3px 6px",
        borderRadius: "10px",
        fontSize: "12px",
        backgroundColor: "color-mix(in srgb, var(--wave-color-solid-base-brighter), transparent 70%) !important",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginRight: "4px",
        minWidth: "48px",
        cursor: "pointer"
    });

    wrapper.title = "Total Play Time of Remaining Queue";

    wrapper.addEventListener("click", () => {
        clicks++;
        if (clicks >= 5) {
            clicks = 0;
            alert("Why the hell are you clicking me????????");
        }
    });

    const timeElement = document.createElement("div");
    timeElement.id = "totalPlayTime";
    Object.assign(timeElement.style, {
        fontWeight: "bold",
        fontSize: "12px",
        textAlign: "center"
    });

    wrapper.appendChild(timeElement);
    return wrapper;
}

async function updateTotalPlayTime() {
    const timeElement = addedElement?.querySelector("#totalPlayTime") as HTMLDivElement | null;
    if (!timeElement) return;

    const queue = await PlayState.playQueue.elements;
    if (!queue || queue.length === 0) return;

    let index = PlayState.playQueue.currentIndex;
    let total = 0;

    for (let i = index; i < queue.length; i++) {
        const item = queue[i];
        if (!item) continue;
        const mediaItem = await MediaItem.fromId(item.mediaItemId);
        if (!mediaItem) continue;
        const duration = await mediaItem.duration;
        if (duration) total += duration;
    }

    remainingPlayTime = total;
    updateDisplayedTime();
}

function updateDisplayedTime() {
    const timeElement = addedElement?.querySelector("#totalPlayTime") as HTMLDivElement | null;
    if (!timeElement) return;

    const clamped = Math.max(0, remainingPlayTime);

    const hours: number = Math.floor((clamped) / 3600);
    const minutes: number = Math.floor((clamped % 3600) / 60);
    const seconds: number = clamped % 60;
  
    const formatted = hours.toString().padStart(2, '0') + ":" + minutes.toString().padStart(2, '0') + ":" + seconds.toString().padStart(2, '0');

    timeElement.textContent = formatted;
}

export const unloads = new Set<LunaUnload>();

unloads.add(() => {
    if (addedElement?.parentElement) {
        addedElement.parentElement.removeChild(addedElement);
    }
    addedElement = null;

    if (observer) {
        observer.disconnect();
        observer = null;
    }
});

ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
    if (data.signal !== "media.currenttime") return;

    const currentIndex = PlayState.playQueue.currentIndex;
    const queue = await PlayState.playQueue.elements;
    const item = queue?.[currentIndex];
    if (!item) return;

    const mediaItem = await MediaItem.fromId(item.mediaItemId);
    const duration = await mediaItem?.duration;
    if (!duration) return;

    const currentTime = Math.floor(Number(data.time));
    const remainingInCurrent = Math.max(0, duration - currentTime);
    let rest = 0;

    for (let i = currentIndex + 1; i < queue.length; i++) {
        const qItem = queue[i];
        if (!qItem) continue;
        const m = await MediaItem.fromId(qItem.mediaItemId);
        const d = await m?.duration;
        if (d) rest += d;
    }

    remainingPlayTime = remainingInCurrent + rest;
    updateDisplayedTime();
});

observer = new MutationObserver(() => {
    const container = document.querySelector("._moreContainer_f6162c8") as HTMLDivElement;
    if (!container || addedElement) return;

    addedElement = createTimeBox();
    container.prepend(addedElement);

    updateTotalPlayTime();
    MediaItem.onMediaTransition(unloads, () => updateTotalPlayTime());
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});
