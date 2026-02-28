import ColorThief from "colorthief";
import { clamp } from "./math";
import { getCachedMediaItemCoverUrl, getMediaItemCacheKey } from "./media";
import type { CoverCapableMediaItem } from "./types";

type RgbTuple = [number, number, number];

export type CoverColors = {
	primary: string;
	accent: string;
	dominantRgb: RgbTuple;
	accentRgb: RgbTuple;
};

type ColorCacheEntry = {
	value: CoverColors;
	expiresAt: number;
};

type SharedColorState = {
	imageByUrl: Map<string, HTMLImageElement>;
	colorCache: Map<string, ColorCacheEntry>;
	inFlightColorByKey: Map<string, Promise<CoverColors | undefined>>;
};

function getSharedColorState(): SharedColorState {
	const root = globalThis as typeof globalThis & {
		__JXNXSDEV_UTILS_COLOR__?: SharedColorState;
	};

	if (!root.__JXNXSDEV_UTILS_COLOR__) {
		root.__JXNXSDEV_UTILS_COLOR__ = {
			imageByUrl: new Map(),
			colorCache: new Map(),
			inFlightColorByKey: new Map(),
		};
	}

	return root.__JXNXSDEV_UTILS_COLOR__;
}

const colorThief = new ColorThief();

/**
 * Converts RGB tuple to CSS rgb() string.
 * @param rgb Tuple in [r, g, b] format.
 * @returns CSS rgb string.
 */
export function toRgbString(rgb: RgbTuple): string {
	return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * Boosts color brightness until it reaches the minimum luminance.
 * @param rgb Source RGB tuple.
 * @param minLuminance Target minimum luminance.
 * @returns Readable RGB tuple.
 */
export function clampReadableColor(
	rgb: RgbTuple,
	minLuminance = 80,
): RgbTuple {
	const [r, g, b] = rgb;
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	if (luminance >= minLuminance) {
		return [r, g, b];
	}

	const factor = minLuminance / Math.max(luminance, 1);
	return [
		clamp(Math.round(r * factor), 0, 255),
		clamp(Math.round(g * factor), 0, 255),
		clamp(Math.round(b * factor), 0, 255),
	];
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
	const state = getSharedColorState();
	const cached = state.imageByUrl.get(url);
	if (cached && cached.complete) {
		return cached;
	}

	const image = cached ?? new Image();
	if (!cached) {
		state.imageByUrl.set(url, image);
	}

	return new Promise((resolve, reject) => {
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load image"));
		image.src = url;
	});
}

/**
 * Extracts primary and accent colors for a media item's cover image with caching.
 * Requests for the same media item and options are deduplicated while in flight.
 * @param mediaItem Media item with id + coverUrl method.
 * @param options Color extraction options.
 * @returns Extracted colors or undefined if no cover is available.
 */
export async function getCoverColorsFromMediaItem(
	mediaItem: CoverCapableMediaItem,
	options: {
		cacheTtlMs?: number;
		paletteSize?: number;
		accentIndex?: number;
		readable?: boolean;
		minLuminance?: number;
		forceRefresh?: boolean;
	} = {},
): Promise<CoverColors | undefined> {
	const state = getSharedColorState();
	const cacheTtlMs = options.cacheTtlMs ?? 2 * 60 * 1000;
	const paletteSize = clamp(options.paletteSize ?? 2, 2, 8);
	const accentIndex = clamp(options.accentIndex ?? 1, 0, paletteSize - 1);
	const minLuminance = options.minLuminance ?? 80;
	const readable = options.readable ?? false;
	const optionKey = `${paletteSize}:${accentIndex}:${readable ? 1 : 0}:${minLuminance}`;
	const baseKey = `${getMediaItemCacheKey(mediaItem)}:${optionKey}`;
	const now = Date.now();

	if (!options.forceRefresh) {
		const cached = state.colorCache.get(baseKey);
		if (cached && cached.expiresAt > now) {
			return cached.value;
		}

		const inFlight = state.inFlightColorByKey.get(baseKey);
		if (inFlight) {
			return inFlight;
		}
	}

	const inFlight = (async () => {
		const coverUrl = await getCachedMediaItemCoverUrl(mediaItem, {
			cacheTtlMs,
			forceRefresh: options.forceRefresh,
		});
		if (!coverUrl) {
			return undefined;
		}

		const image = await loadImageFromUrl(coverUrl);
		const dominantColor = colorThief.getColor(image) as RgbTuple;
		const palette = colorThief.getPalette(image, paletteSize) as RgbTuple[];
		const accent = palette[accentIndex] ?? palette[0] ?? dominantColor;

		const dominantRgb = readable
			? clampReadableColor(dominantColor, minLuminance)
			: dominantColor;
		const accentRgb = readable
			? clampReadableColor(accent, minLuminance)
			: accent;

		const value: CoverColors = {
			primary: toRgbString(dominantRgb),
			accent: toRgbString(accentRgb),
			dominantRgb,
			accentRgb,
		};

		state.colorCache.set(baseKey, {
			value,
			expiresAt: Date.now() + cacheTtlMs,
		});

		return value;
	})();

	state.inFlightColorByKey.set(baseKey, inFlight);
	try {
		return await inFlight;
	} finally {
		state.inFlightColorByKey.delete(baseKey);
	}
}
