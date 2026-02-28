/**
 * Minimal contract for media items that can resolve a cover image URL.
 */
export type CoverCapableMediaItem = {
	id: unknown;
	coverUrl: () => Promise<string | null | undefined>;
};

/**
 * Minimal media item surface shared by snapshot and metadata helpers.
 */
export type LunaMediaItemLike = {
	id: unknown;
	title?: () => Promise<string | null | undefined>;
	artist?: () => Promise<
		| string
		| { name?: string; tidalArtist?: { name?: string } }
		| null
		| undefined
	>;
	coverUrl?: () => Promise<string | null | undefined>;
	lyrics?: () => Promise<unknown>;
	duration?: Promise<number | null | undefined> | number | null | undefined;
	releaseDate?: () => Promise<Date | null | undefined>;
	album?: () => Promise<{ title: () => Promise<string | null | undefined> } | null | undefined>;
};
