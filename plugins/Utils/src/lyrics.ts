type ParsedLyricLine = {
	timeInSeconds: number;
	text: string;
};

/**
 * Parses LRC subtitle content into time-based lyric lines.
 * @param subtitles Raw subtitle text where each line starts with [mm:ss.xx].
 * @returns Parsed lyric lines sorted by timestamp.
 */
export function parseLrcSubtitles(subtitles: string): ParsedLyricLine[] {
	const parsed: ParsedLyricLine[] = [];
	for (const line of subtitles.split("\n")) {
		const [timePart, textPart] = line.split("]");
		if (!textPart || !timePart) {
			continue;
		}

		const [minRaw, secRaw] = timePart.replace("[", "").split(":");
		const minutes = Number(minRaw);
		const seconds = Number(secRaw);
		if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
			continue;
		}

		parsed.push({
			timeInSeconds: Math.floor(minutes * 60 + seconds),
			text: textPart.trim(),
		});
	}

	parsed.sort((left, right) => left.timeInSeconds - right.timeInSeconds);
	return parsed;
}

/**
 * Builds a timestamp-to-lyric map from subtitles.
 * @param subtitles Raw subtitle text.
 * @returns Map keyed by time in seconds.
 */
export function buildLyricMap(subtitles: string): Map<number, string> {
	const map = new Map<number, string>();
	for (const line of parseLrcSubtitles(subtitles)) {
		map.set(line.timeInSeconds, line.text);
	}
	return map;
}

/**
 * Resolves the closest lyric timestamp at or before the current playback time.
 * @param lyricMap Map of timestamp -> lyric text.
 * @param currentTimeSeconds Current playback time in seconds.
 * @returns Closest timestamp or null.
 */
export function getClosestLyricTime(
	lyricMap: Map<number, string>,
	currentTimeSeconds: number,
): number | null {
	let closest: number | null = null;
	let maxTime = -Infinity;
	for (const [time] of lyricMap) {
		if (time <= currentTimeSeconds && time > maxTime) {
			maxTime = time;
			closest = time;
		}
	}
	return closest;
}

/**
 * Resolves the lyric line text at or before the current playback time.
 * @param lyricMap Map of timestamp -> lyric text.
 * @param currentTimeSeconds Current playback time in seconds.
 * @returns Lyric line text or undefined.
 */
export function getLyricLineAtTime(
	lyricMap: Map<number, string>,
	currentTimeSeconds: number,
): string | undefined {
	const closestTime = getClosestLyricTime(lyricMap, currentTimeSeconds);
	if (closestTime === null) {
		return undefined;
	}
	return lyricMap.get(closestTime);
}
