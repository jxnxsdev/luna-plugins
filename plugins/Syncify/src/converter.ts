import * as lib from "@luna/lib";
import { v4 } from "uuid";
import { DataSong } from "./types/dataSong";
import { SpotifySong } from "./types/spotify";
import {
  retryWithBackoff,
  sanitizeSearchQuery,
  getTidalCredentials,
} from "./utils";
import { trace } from ".";

export interface ConversionResult {
  success: boolean;
  song?: DataSong;
  error?: string;
  spotifySong: SpotifySong;
}

/**
 * Search for a song on Tidal with multiple fallback strategies
 * @param title Song title
 * @param artists Array of artist names
 * @param spotifyId Spotify song ID for tracking
 * @returns Tidal song data or undefined if not found
 */
async function searchTidalForSong(
  title: string,
  artists: string[],
  spotifyId: string,
): Promise<{ id: string; title: string; artists: string[] } | undefined> {
  try {
    const searchStrategies = [
      `${title} ${artists.join(" ")}`,
      `${title} ${artists[0]}`,
      title,
    ];

    for (let i = 0; i < searchStrategies.length; i++) {
      const searchTerm = sanitizeSearchQuery(searchStrategies[i]);

      try {
        const result = await searchTidalWithTerm(searchTerm);
        if (result) {
          if (i > 0) {
            trace.warn(
              `Found match using fallback strategy ${i + 1} for '${title}' by ${artists.join(", ")}`,
            );
          }
          return result;
        }
      } catch (error) {
        if (i === searchStrategies.length - 1) {
          throw error;
        }
      }
    }

    return undefined;
  } catch (error) {
    trace.err(
      `Search failed for '${title}' by ${artists.join(", ")}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Search Tidal with a specific term
 * @param searchTerm Query string to search
 * @returns Tidal song data or undefined if not found
 */
async function searchTidalWithTerm(
  searchTerm: string,
): Promise<{ id: string; title: string; artists: string[] } | undefined> {
  return retryWithBackoff(
    async () => {
      const creds = await getTidalCredentials();

      const url = `https://api.tidal.com/v2/search/?includeContributors=true&includeDidYouMean=true&includeUserPlaylists=false&limit=20&query=${encodeURIComponent(searchTerm)}&supportsUserData=true&types=TRACKS`;

      const response = await fetch(url, {
        headers: {
          Method: "GET",
          Authorization: `Bearer ${creds.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Search failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data || !data.tracks?.items || data.tracks.items.length === 0) {
        return undefined;
      }

      const firstResult = data.tracks.items[0];
      if (!firstResult || !firstResult.id) {
        return undefined;
      }

      return {
        id: firstResult.id,
        title: firstResult.title,
        artists: firstResult.artists?.map((a: any) => a.name) || [],
      };
    },
    `Searching Tidal for '${searchTerm}'`,
    2,
  );
}

/**
 * Convert a Spotify song to a DataSong format
 * @param spotifySong Spotify song object
 * @returns Conversion result with success status and song data
 */
export async function SpotifyToDataSong(
  spotifySong: SpotifySong,
): Promise<ConversionResult> {
  if (!spotifySong) {
    return {
      success: false,
      error: "Invalid Spotify song data",
      spotifySong,
    };
  }

  if (
    !spotifySong.title ||
    !spotifySong.artists ||
    spotifySong.artists.length === 0
  ) {
    return {
      success: false,
      error: "Missing title or artists",
      spotifySong,
    };
  }

  try {
    const tidalResult = await searchTidalForSong(
      spotifySong.title,
      spotifySong.artists,
      spotifySong.spotifyId,
    );

    if (!tidalResult) {
      return {
        success: false,
        error: `No match found on Tidal for '${spotifySong.title}' by ${spotifySong.artists.join(", ")}`,
        spotifySong,
      };
    }

    const uuid = v4();

    const dataSong: DataSong = {
      title: tidalResult.title,
      artist: tidalResult.artists.join(", "),
      tidalId: tidalResult.id,
      spotifyId: spotifySong.spotifyId,
      id: uuid,
    };

    return {
      success: true,
      song: dataSong,
      spotifySong,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
      spotifySong,
    };
  }
}

/**
 * Convert multiple Spotify songs to DataSongs
 * @param spotifySongs Array of Spotify songs to convert
 * @param onProgress Optional callback for progress updates
 * @returns Array of conversion results
 */
export async function convertSpotifySongs(
  spotifySongs: SpotifySong[],
  onProgress?: (processed: number, total: number, current: SpotifySong) => void,
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];

  for (let i = 0; i < spotifySongs.length; i++) {
    const spotifySong = spotifySongs[i];

    if (onProgress) {
      onProgress(i, spotifySongs.length, spotifySong);
    }

    const result = await SpotifyToDataSong(spotifySong);
    results.push(result);

    if (i < spotifySongs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}
