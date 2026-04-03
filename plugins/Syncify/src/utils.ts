import * as lib from "@luna/lib";
import {
  batchProcess,
  createUserErrorMessage,
  fetchWithRetry as sharedFetchWithRetry,
  getTidalCredentials as sharedGetTidalCredentials,
  retryWithBackoff as sharedRetryWithBackoff,
  safeMediaItemFromId as sharedSafeMediaItemFromId,
  sanitizeSearchQuery,
  sleep,
} from "@jxnxsdev/utils";
import { trace } from ".";

export {
  batchProcess,
  createUserErrorMessage,
  sanitizeSearchQuery,
  sleep,
};

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
  return sharedRetryWithBackoff(fn, {
    maxRetries,
    baseDelayMs: RETRY_CONFIG.baseDelay,
    maxDelayMs: RETRY_CONFIG.maxDelay,
    onRetry: (attempt, maxAttempts, error, nextDelayMs) => {
      trace.warn(
        `${context} failed (attempt ${attempt}/${maxAttempts}), retrying in ${nextDelayMs}ms...`,
      );
      if (!error.message) {
        trace.warn(`${context} retry reason: ${String(error)}`);
      }
    },
  });
}

/**
 * Get Tidal credentials with error handling
 */
export async function getTidalCredentials(): Promise<{ token: string }> {
  return sharedGetTidalCredentials();
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string,
): Promise<Response> {
  return sharedFetchWithRetry(url, options, context, {
    maxRetries: RETRY_CONFIG.maxRetries,
    baseDelayMs: RETRY_CONFIG.baseDelay,
    maxDelayMs: RETRY_CONFIG.maxDelay,
    onRetry: (attempt, maxAttempts, error, nextDelayMs) => {
      trace.warn(
        `${context} failed (attempt ${attempt}/${maxAttempts}), retrying in ${nextDelayMs}ms...`,
      );
      if (!error.message) {
        trace.warn(`${context} retry reason: ${String(error)}`);
      }
    },
  });
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
  return sharedSafeMediaItemFromId(id, {
    validate: async (item) => typeof (await item.title()) === "string",
    onError: (error) => {
      trace.err(`Error resolving media item '${id}': ${String(error)}`);
    },
  });
}
