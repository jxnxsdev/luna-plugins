import type { CoverCapableMediaItem, LunaMediaItemLike } from "./types";

function normalizeArtistValue(
	artist: string | { name?: string; tidalArtist?: { name?: string } } | null | undefined,
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
export async function getMediaItemSnapshot(mediaItem: LunaMediaItemLike): Promise<{
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
			.then(async (value) => (value ? (await value.title()) || "Unknown Album" : "Unknown Album"))) ||
		"Unknown Album";
	const durationValue =
		typeof mediaItem.duration === "number"
			? mediaItem.duration
			: await mediaItem.duration;
	const duration = Number(durationValue ?? 0);
	const releaseDate = await mediaItem.releaseDate?.();
	const year = releaseDate ? releaseDate.getFullYear().toString() : "Unknown Year";

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
