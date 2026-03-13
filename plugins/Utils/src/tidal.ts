import * as lib from "@luna/lib";

/**
 * Reads current Tidal credentials and ensures an access token exists.
 * @returns Credentials object with token.
 */
export async function getTidalCredentials(): Promise<{ token: string }> {
	const creds = await lib.getCredentials();
	if (!creds || !creds.token) {
		throw new Error("No valid Tidal credentials found");
	}
	return creds;
}

/**
 * Safely resolves a Tidal media item by id with optional validation callback.
 * @param id Tidal media item id.
 * @param options Optional validation and error hook.
 * @returns Media item instance or null.
 */
export async function safeMediaItemFromId(
	id: string,
	options: {
		validate?: (item: lib.MediaItem) => Promise<boolean> | boolean;
		onError?: (error: unknown) => void;
	} = {},
): Promise<lib.MediaItem | null> {
	try {
		const item = await lib.MediaItem.fromId(id);
		if (!item) {
			return null;
		}

		if (options.validate) {
			const valid = await options.validate(item);
			if (!valid) {
				return null;
			}
		}

		return item;
	} catch (error) {
		options.onError?.(error);
		return null;
	}
}
