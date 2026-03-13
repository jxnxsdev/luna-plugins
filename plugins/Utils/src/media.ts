import type { CoverCapableMediaItem, LunaMediaItemLike } from "./types";
import type { LunaUnload } from "@luna/core";
import { ipcRenderer, MediaItem, PlayState } from "@luna/lib";

function normalizeArtistValue(
  artist:
    | string
    | { name?: string; tidalArtist?: { name?: string } }
    | null
    | undefined,
): string {
  if (!artist) {
    return "Unknown Artist";
  }
  if (typeof artist === "string") {
    return artist || "Unknown Artist";
  }
  return artist.name || artist.tidalArtist?.name || "Unknown Artist";
}

type SharedUtilsState = {
  coverUrlCache: Map<string, { value: string; expiresAt: number }>;
  coverUrlInFlight: Map<string, Promise<string | undefined>>;
};

function getSharedState(): SharedUtilsState {
  const root = globalThis as typeof globalThis & {
    __JXNXSDEV_UTILS__?: SharedUtilsState;
  };

  if (!root.__JXNXSDEV_UTILS__) {
    root.__JXNXSDEV_UTILS__ = {
      coverUrlCache: new Map(),
      coverUrlInFlight: new Map(),
    };
  }

  return root.__JXNXSDEV_UTILS__;
}

/**
 * Produces a stable cache key for media-like objects.
 * @param mediaItem Item containing an id.
 * @returns String cache key.
 */
export function getMediaItemCacheKey(mediaItem: { id: unknown }): string {
  return String(mediaItem.id);
}

/**
 * Resolves and caches cover URL values for media items.
 * Requests for the same item are deduplicated while in flight.
 * @param mediaItem Item with coverUrl method.
 * @param options Cache controls.
 * @returns Cover URL or undefined.
 */
export async function getCachedMediaItemCoverUrl(
  mediaItem: CoverCapableMediaItem,
  options: {
    cacheTtlMs?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<string | undefined> {
  const cacheTtlMs = options.cacheTtlMs ?? 2 * 60 * 1000;
  const cacheKey = getMediaItemCacheKey(mediaItem);
  const now = Date.now();
  const state = getSharedState();

  if (!options.forceRefresh) {
    const cached = state.coverUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const inFlight = state.coverUrlInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const inFlight = (async () => {
    const resolved = await mediaItem.coverUrl();
    const normalized = resolved ?? undefined;

    if (normalized) {
      state.coverUrlCache.set(cacheKey, {
        value: normalized,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }

    return normalized;
  })();

  state.coverUrlInFlight.set(cacheKey, inFlight);
  try {
    return await inFlight;
  } finally {
    state.coverUrlInFlight.delete(cacheKey);
  }
}

/**
 * Resolves a media item by id safely.
 * @param resolver Function capable of resolving id -> media item.
 * @param id Media item id.
 * @returns Resolved item or null on failure.
 */
export async function safeResolveMediaItemById<T>(
  resolver: (id: string) => Promise<T | null | undefined>,
  id: string,
): Promise<T | null> {
  try {
    const item = await resolver(id);
    return item ?? null;
  } catch {
    return null;
  }
}

/**
 * Collects a normalized media snapshot payload with null-safe fallbacks.
 * @param mediaItem Media item-like object.
 * @returns Snapshot with core metadata fields.
 */
export async function getMediaItemSnapshot(
  mediaItem: LunaMediaItemLike,
): Promise<{
  title: string;
  artist: string;
  coverUrl: string;
  lyrics: unknown;
  album: string;
  duration: number;
  year: string;
}> {
  const title = (await mediaItem.title?.()) || "Unknown Title";
  const artist = normalizeArtistValue(await mediaItem.artist?.());
  const coverUrl = (await mediaItem.coverUrl?.()) || "";
  const lyrics = (await mediaItem.lyrics?.()) || "";
  const album =
    (await mediaItem
      .album?.()
      .then(async (value) =>
        value ? (await value.title()) || "Unknown Album" : "Unknown Album",
      )) || "Unknown Album";
  const durationValue =
    typeof mediaItem.duration === "number"
      ? mediaItem.duration
      : await mediaItem.duration;
  const duration = Number(durationValue ?? 0);
  const releaseDate = await mediaItem.releaseDate?.();
  const year = releaseDate
    ? releaseDate.getFullYear().toString()
    : "Unknown Year";

  return {
    title,
    artist,
    coverUrl,
    lyrics,
    album,
    duration,
    year,
  };
}

export type PlaybackSnapshot = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  lyrics: unknown;
  album: string;
  duration: number;
  year: string;
  songProgress: number;
  isPlaying: boolean;
};

/**
 * Subscribes to now-playing changes and emits normalized snapshots.
 * The stream is deduplicated and time updates are throttled to avoid
 * dispatching the same payload repeatedly across plugins.
 */
export function observePlaybackSnapshot(
  unloads: Set<LunaUnload>,
  onUpdate: (snapshot: PlaybackSnapshot) => void | Promise<void>,
  options: {
    minUpdateIntervalMs?: number;
  } = {},
): void {
  const minUpdateIntervalMs = Math.max(0, options.minUpdateIntervalMs ?? 150);
  let lastEmitMs = 0;
  let lastSignature = "";

  const emitSnapshot = async (
    progressOverride?: number,
    force = false,
  ): Promise<void> => {
    const mediaItem = await MediaItem.fromPlaybackContext();
    if (!mediaItem) return;

    const snapshot = await getMediaItemSnapshot(mediaItem);
    const rawProgress =
      typeof progressOverride === "number"
        ? progressOverride
        : Number(PlayState.currentTime ?? 0);
    const songProgress = Math.max(0, Math.floor(rawProgress));
    const isPlaying = PlayState.playing;

    const signature = `${String(mediaItem.id)}:${songProgress}:${isPlaying ? 1 : 0}`;
    if (!force && signature === lastSignature) return;

    lastSignature = signature;
    lastEmitMs = Date.now();
    await onUpdate({
      id: String(mediaItem.id),
      title: snapshot.title,
      artist: snapshot.artist,
      coverUrl: snapshot.coverUrl,
      lyrics: snapshot.lyrics,
      album: snapshot.album,
      duration: snapshot.duration,
      year: snapshot.year,
      songProgress,
      isPlaying,
    });
  };

  MediaItem.onMediaTransition(unloads, async () => {
    await emitSnapshot(0, true);
  });

  PlayState.onState(unloads, async () => {
    await emitSnapshot(undefined, true);
  });

  ipcRenderer.on(unloads, "client.playback.playersignal", async (data) => {
    if (data?.signal !== "media.currenttime") return;
    const now = Date.now();
    if (now - lastEmitMs < minUpdateIntervalMs) return;
    await emitSnapshot(Number(data.time) || 0);
  });

  void emitSnapshot(undefined, true);
}
