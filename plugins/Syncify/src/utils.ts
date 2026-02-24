import * as lib from "@luna/lib";
import { trace } from ".";

/**
 * API retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = RETRY_CONFIG.maxRetries,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelay,
        );
        trace.warn(
          `${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `${context} failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
  );
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get Tidal credentials with error handling
 */
export async function getTidalCredentials(): Promise<{ token: string }> {
  try {
    const creds = await lib.getCredentials();
    if (!creds || !creds.token) {
      throw new Error("No valid Tidal credentials found");
    }
    return creds;
  } catch (error) {
    throw new Error(
      `Failed to get Tidal credentials: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string,
): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  }, context);
}

/**
 * Get playlist ETag with retry logic
 */
export async function getPlaylistETag(playlistId: string): Promise<string> {
  return retryWithBackoff(async () => {
    const url = `https://desktop.tidal.com/v1/playlists/${playlistId}/items?countryCode=DE&locale=de_DE&deviceType=DESKTOP`;
    const creds = await getTidalCredentials();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ETag: ${response.statusText}`);
    }

    const etag = response.headers.get("etag");
    if (!etag) {
      throw new Error("ETag header not found in response");
    }

    return etag;
  }, `Fetching ETag for playlist ${playlistId}`);
}

/**
 * Add media item to playlist with proper ETag handling
 * @param playlist Target playlist
 * @param mediaItem Media item to add
 * @param etag Current ETag for concurrency control
 * @returns Result object with success status, new ETag, and error details
 */
export async function addMediaItemToPlaylist(
  playlist: lib.Playlist,
  mediaItem: lib.MediaItem,
  etag: string,
): Promise<{
  success: boolean;
  newEtag?: string;
  error?: string;
  isDuplicate?: boolean;
  needsEtagRefresh?: boolean;
}> {
  try {
    const url = `https://desktop.tidal.com/v1/playlists/${playlist.uuid}/items`;
    const creds = await getTidalCredentials();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "If-None-Match": etag,
      },
      referrer: `https://desktop.tidal.com/playlist/${playlist.uuid}`,
      referrerPolicy: "strict-origin-when-cross-origin",
      body: `onArtifactNotFound=FAIL&onDupes=FAIL&trackIds=${mediaItem.id}`,
    });

    if (!response.ok) {
      if (response.status === 412) {
        return {
          success: false,
          error: "ETag is stale, needs refresh",
          needsEtagRefresh: true,
        };
      }
      if (response.status === 409) {
        return { success: true, isDuplicate: true };
      }
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const newEtag = response.headers.get("etag");
    return { success: true, newEtag: newEtag ?? undefined };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete media item from playlist
 * @param playlist Target playlist
 * @param index Index of the item to delete
 * @returns Result object with success status and error details
 */
export async function deleteMediaItemFromPlaylist(
  playlist: lib.Playlist,
  index: number,
): Promise<{ success: boolean; error?: string; needsEtagRefresh?: boolean }> {
  try {
    const url = `https://desktop.tidal.com/v1/playlists/${playlist.uuid}/items/${index}?order=INDEX&orderDirection=ASC`;
    const creds = await getTidalCredentials();

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${creds.token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 412) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          needsEtagRefresh: true,
        };
      }
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Safely resolve a media item from ID
 * @param id Tidal media item ID
 * @returns MediaItem instance or null if resolution fails
 */
export async function safeMediaItemFromId(
  id: string,
): Promise<lib.MediaItem | null> {
  try {
    const item = await lib.MediaItem.fromId(id);
    if (item && typeof (await item.title()) === "string") {
      return item;
    }
    return null;
  } catch (err) {
    trace.err(`Error resolving media item '${id}': ${String(err)}`);
    return null;
  }
}

/**
 * Sanitize search query for better matching
 * @param query Raw search query string
 * @returns Sanitized query string
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create user-friendly error message
 * @param context Error context description
 * @param error Error object or string
 * @returns Formatted error message
 */
export function createUserErrorMessage(
  context: string,
  error: unknown,
): string {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return `${context}: ${errorMsg}`;
}

/**
 * Batch process items with delay between batches
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param options Batch processing options (batchSize, delay, progress callback)
 * @returns Array of processing results
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {},
): Promise<R[]> {
  const { batchSize = 10, delayBetweenBatches = 1000, onProgress } = options;

  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => processor(item, i + batchIndex)),
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress(results.length, items.length);
    }

    if (i + batchSize < items.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}
