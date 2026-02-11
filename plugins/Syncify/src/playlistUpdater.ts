import * as lib from "@luna/lib";
import { DataPlaylist } from "./types/dataPlaylist";
import { DataSong } from "./types/dataSong";
import {
  trace,
  refreshTokenIfNeeded,
  getSpotifyPlaylistsNative,
  getSpotifyPlaylistSongsNative,
} from ".";
import { settings } from "./Settings";
import { convertSpotifySongs, ConversionResult } from "./converter";
import { DatabaseService } from "./database";
import {
  getPlaylistETag,
  addMediaItemToPlaylist,
  deleteMediaItemFromPlaylist,
  safeMediaItemFromId,
  createUserErrorMessage,
  sleep,
} from "./utils";
import { syncWidget } from "./syncWidget";

let isUpdating = false;
let updateProgress = {
  currentPlaylist: "",
  processedSongs: 0,
  totalSongs: 0,
  isConverting: false,
};

/**
 * Get the current update progress
 * @returns Copy of the current update progress state
 */
export function getUpdateProgress(): typeof updateProgress {
  return { ...updateProgress };
}

/**
 * Main function to update all playlists
 * Orchestrates the complete sync process with error handling and progress tracking
 */
export async function updatePlaylists(): Promise<void> {
  if (isUpdating) {
    trace.warn(
      "⏸️ Playlist update already in progress. Please wait until the current update is finished.",
    );
    return;
  }

  isUpdating = true;
  const startTime = Date.now();

  try {
    trace.log("🔄 Starting playlist update...");
    await refreshTokenIfNeeded();
    await updatePlaylistsInt();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    trace.log(`✅ Playlist update completed successfully in ${duration}s`);
  } catch (error) {
    const errorMsg = createUserErrorMessage("Playlist update failed", error);
    trace.err(`❌ ${errorMsg}`);
    syncWidget.endSync();
  } finally {
    isUpdating = false;
    updateProgress = {
      currentPlaylist: "",
      processedSongs: 0,
      totalSongs: 0,
      isConverting: false,
    };
  }
}

/**
 * Internal function to update playlists
 * Handles playlist synchronization workflow including widget initialization
 */
async function updatePlaylistsInt(): Promise<void> {
  if (!settings.isLoggedIn) {
    throw new Error("User is not logged in. Please log in to Spotify first.");
  }

  const spotifyPlaylists = await getSpotifyPlaylistsNative(settings.token);
  if (!spotifyPlaylists?.length) {
    trace.warn("📭 No Spotify playlists found.");
    syncWidget.endSync();
    return;
  }

  const playlistsToSync = settings.activePlaylists;
  if (!playlistsToSync.length) {
    trace.warn(
      "⚠️ No active playlists to sync. Please select playlists in the settings.",
    );
    syncWidget.endSync();
    return;
  }

  trace.log(`📋 Syncing ${playlistsToSync.length} playlist(s)...`);

  const playlistNames: string[] = [];
  for (const playlistId of playlistsToSync) {
    const dataPlaylist = await DatabaseService.getPlaylistByTidalId(playlistId);
    if (dataPlaylist) {
      playlistNames.push(dataPlaylist.name);
    }
  }

  syncWidget.startSync(playlistNames);

  for (const playlistId of playlistsToSync) {
    try {
      await updateSinglePlaylist(playlistId, spotifyPlaylists);
    } catch (error) {
      const errorMsg = createUserErrorMessage(
        `Failed to update playlist ${playlistId}`,
        error,
      );
      trace.err(`❌ ${errorMsg}`);

      const dataPlaylist =
        await DatabaseService.getPlaylistByTidalId(playlistId);
      if (dataPlaylist) {
        syncWidget.errorPlaylist(dataPlaylist.name, errorMsg);
      }
    }
  }

  syncWidget.endSync();
}

/**
 * Update a single playlist
 * @param playlistId Tidal playlist ID
 * @param spotifyPlaylists Array of Spotify playlists
 */
async function updateSinglePlaylist(
  playlistId: string,
  spotifyPlaylists: any[],
): Promise<void> {
  const playlist = await lib.Playlist.fromId(playlistId);
  if (!playlist) {
    throw new Error(`Playlist with ID ${playlistId} not found on Tidal`);
  }

  const playlistTitle = await playlist.title();
  updateProgress.currentPlaylist = playlistTitle;

  syncWidget.setCurrentPlaylist(playlistTitle);

  trace.log(`🎵 Processing playlist: ${playlistTitle}`);

  const dataPlaylist = await DatabaseService.getPlaylistByTidalId(playlistId);
  if (!dataPlaylist) {
    throw new Error(
      `Data playlist with ID ${playlistId} not found. Cannot sync playlist '${playlistTitle}'. Please re-add it in the settings.`,
    );
  }

  const spotifyPlaylist = spotifyPlaylists.find(
    (p) => p.spotifyId === dataPlaylist.spotifyId,
  );
  if (!spotifyPlaylist) {
    throw new Error(
      `Playlist '${dataPlaylist.name}' not found in Spotify playlists. Has it been deleted on Spotify?`,
    );
  }

  const spotifySongs = await getSpotifyPlaylistSongsNative(
    spotifyPlaylist,
    settings.token,
  );
  const spotifySongList = spotifySongs.songs ?? [];

  if (!spotifySongList.length) {
    trace.warn(
      `📭 No songs found in Spotify playlist '${spotifyPlaylist.name}'.`,
    );
    return;
  }

  trace.log(`📊 Found ${spotifySongList.length} songs in Spotify playlist`);

  const dataPlaylistSongs = await convertAndFetchSongs(
    spotifySongList,
    dataPlaylist.name,
  );

  if (!dataPlaylistSongs.length) {
    throw new Error(
      `No valid songs found for playlist '${spotifyPlaylist.name}'. All conversions failed.`,
    );
  }

  trace.log(
    `✅ Successfully converted/found ${dataPlaylistSongs.length}/${spotifySongList.length} songs`,
  );

  const hasChanged = hasPlaylistChanged(
    dataPlaylist.songsData,
    dataPlaylistSongs,
  );
  if (!hasChanged) {
    trace.log(
      `⏭️ No changes detected for playlist '${dataPlaylist.name}', skipping update`,
    );
    syncWidget.completePlaylist(playlistTitle, {
      added: 0,
      removed: 0,
      skipped: dataPlaylistSongs.length,
      duplicates: 0,
    });
    return;
  }

  dataPlaylist.songsData = dataPlaylistSongs;
  await DatabaseService.updatePlaylist(dataPlaylist);

  await syncToTidalPlaylist(playlist, dataPlaylistSongs, playlistTitle);
}

/**
 * Convert Spotify songs and fetch existing DataSongs
 * @param spotifySongList Array of Spotify songs to process
 * @param playlistName Name of the playlist for progress tracking
 * @returns Array of DataSong objects
 */
async function convertAndFetchSongs(
  spotifySongList: any[],
  playlistName: string,
): Promise<DataSong[]> {
  const existingSongs = await DatabaseService.getSongs();
  const existingSongsMap = new Map(
    existingSongs.map((song) => [song.spotifyId, song]),
  );

  const songsToConvert = spotifySongList.filter(
    (song) => !existingSongsMap.has(song.spotifyId),
  );

  let convertedSongs: DataSong[] = [];

  if (songsToConvert.length > 0) {
    updateProgress.isConverting = true;
    updateProgress.totalSongs = songsToConvert.length;

    trace.log(`🔄 Converting ${songsToConvert.length} new songs...`);

    const conversionResults = await convertSpotifySongs(
      songsToConvert,
      (processed, total, current) => {
        updateProgress.processedSongs = processed + 1;
        // Update widget with conversion progress
        syncWidget.setConversionProgress(
          processed + 1,
          total,
          `${current.title} - ${current.artists.join(", ")}`,
        );
        trace.log(
          `🔄 Converting: ${current.title} (${processed + 1}/${total})...`,
        );
      },
    );

    syncWidget.clearConversionProgress();

    const successfulConversions: DataSong[] = [];
    const failedConversions: ConversionResult[] = [];

    for (const result of conversionResults) {
      if (result.success && result.song) {
        successfulConversions.push(result.song);
      } else {
        failedConversions.push(result);
      }
    }

    if (successfulConversions.length > 0) {
      const addedCount = await DatabaseService.addSongs(successfulConversions);
      trace.log(`✅ Successfully converted and saved ${addedCount} new songs`);
      convertedSongs = successfulConversions;
    }

    if (failedConversions.length > 0) {
      trace.warn(`⚠️ Failed to convert ${failedConversions.length} songs:`);
      for (const failed of failedConversions.slice(0, 5)) {
        const songName = `${failed.spotifySong.title} by ${failed.spotifySong.artists.join(", ")}`;
        trace.warn(`  • ${songName} - ${failed.error}`);
        syncWidget.addFailedSong(playlistName, songName);
      }
      if (failedConversions.length > 5) {
        trace.warn(`  ... and ${failedConversions.length - 5} more`);
        for (const failed of failedConversions.slice(5)) {
          const songName = `${failed.spotifySong.title} by ${failed.spotifySong.artists.join(", ")}`;
          syncWidget.addFailedSong(playlistName, songName);
        }
      }
    }

    updateProgress.isConverting = false;
  }

  const dataPlaylistSongs: DataSong[] = [];
  for (const spotifySong of spotifySongList) {
    const dataSong =
      existingSongsMap.get(spotifySong.spotifyId) ||
      convertedSongs.find((s) => s.spotifyId === spotifySong.spotifyId);

    if (dataSong) {
      dataPlaylistSongs.push(dataSong);
    }
  }

  return dataPlaylistSongs;
}

/**
 * Check if playlist has changed
 * @param oldSongs Previous array of songs
 * @param newSongs New array of songs
 * @returns True if playlists differ
 */
function hasPlaylistChanged(
  oldSongs: DataSong[],
  newSongs: DataSong[],
): boolean {
  if (oldSongs.length !== newSongs.length) {
    return true;
  }

  for (let i = 0; i < oldSongs.length; i++) {
    if (oldSongs[i].spotifyId !== newSongs[i].spotifyId) {
      return true;
    }
  }

  return false;
}

/**
 * Sync songs to Tidal playlist
 * @param playlist Tidal playlist instance
 * @param dataPlaylistSongs Array of DataSong objects to sync
 * @param playlistName Playlist name for progress tracking
 */
async function syncToTidalPlaylist(
  playlist: lib.Playlist,
  dataPlaylistSongs: DataSong[],
  playlistName: string,
): Promise<void> {
  trace.log(
    `🔄 Syncing ${dataPlaylistSongs.length} songs to Tidal playlist...`,
  );

  const mediaItems: lib.MediaItem[] = [];
  const failedItems: string[] = [];

  for (let i = 0; i < dataPlaylistSongs.length; i++) {
    const song = dataPlaylistSongs[i];

    syncWidget.setPlaylistOperation(
      playlistName,
      "resolving",
      i + 1,
      dataPlaylistSongs.length,
      `${song.title} - ${song.artist}`,
    );

    const mediaItem = await safeMediaItemFromId(song.tidalId);
    if (mediaItem) {
      mediaItems.push(mediaItem);
    } else {
      failedItems.push(`${song.title} by ${song.artist}`);
    }
  }

  if (failedItems.length > 0) {
    trace.warn(`⚠️ Failed to resolve ${failedItems.length} media items:`);
    for (const failed of failedItems.slice(0, 5)) {
      trace.warn(`  • ${failed}`);
    }
    if (failedItems.length > 5) {
      trace.warn(`  ... and ${failedItems.length - 5} more`);
    }
  }

  if (mediaItems.length === 0) {
    throw new Error(
      `No valid media items found for playlist. All ${dataPlaylistSongs.length} items failed to resolve.`,
    );
  }

  // Get existing playlist items
  const playlistItemsAsync = await playlist.mediaItems();
  const playlistItems: lib.MediaItem[] = [];
  for await (const item of playlistItemsAsync) {
    playlistItems.push(item);
  }

  let etag = await getPlaylistETag(String(playlist.uuid));

  let addedCount = 0;
  let removedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let offsetCount = 0;

  for (let i = 0; i < mediaItems.length; i++) {
    const newItem = mediaItems[i];
    const existingItem = playlistItems[i];

    const songTitle = await newItem.title();
    const songArtist = (await newItem.artist())?.name || "Unknown";
    syncWidget.setPlaylistOperation(
      playlistName,
      "adding",
      i + 1,
      mediaItems.length,
      `${songTitle} - ${songArtist}`,
    );

    if (existingItem?.id === newItem.id) {
      skippedCount++;
      continue;
    }

    if (existingItem) {
      let deleteResult = await deleteMediaItemFromPlaylist(
        playlist,
        i - offsetCount,
      );

      if (deleteResult.needsEtagRefresh) {
        trace.warn("ETag is stale during delete, refreshing...");
        await sleep(500);
        etag = await getPlaylistETag(String(playlist.uuid));
        deleteResult = await deleteMediaItemFromPlaylist(
          playlist,
          i - offsetCount,
        );
      }

      if (deleteResult.success) {
        removedCount++;
        offsetCount++;
      } else {
        trace.err(
          `Failed to remove item at position ${i}: ${deleteResult.error}`,
        );
        await sleep(300);
        etag = await getPlaylistETag(String(playlist.uuid));
      }
    }

    let addResult = await addMediaItemToPlaylist(playlist, newItem, etag);

    if (addResult.needsEtagRefresh) {
      trace.warn("ETag is stale during add, refreshing...");
      await sleep(500);
      etag = await getPlaylistETag(String(playlist.uuid));
      addResult = await addMediaItemToPlaylist(playlist, newItem, etag);
    }

    if (!addResult.success) {
      trace.err(
        `Failed to add '${await newItem.title()}' to playlist: ${addResult.error}`,
      );
      await sleep(300);
      etag = await getPlaylistETag(String(playlist.uuid));
      continue;
    }

    if (addResult.isDuplicate) {
      duplicateCount++;
    } else {
      addedCount++;
    }

    etag = addResult.newEtag ?? etag;
  }

  for (let i = mediaItems.length; i < playlistItems.length; i++) {
    let deleteResult = await deleteMediaItemFromPlaylist(
      playlist,
      mediaItems.length,
    );

    if (deleteResult.needsEtagRefresh) {
      trace.warn("ETag is stale during cleanup, refreshing...");
      await sleep(500);
      etag = await getPlaylistETag(String(playlist.uuid));
      deleteResult = await deleteMediaItemFromPlaylist(
        playlist,
        mediaItems.length,
      );
    }

    if (deleteResult.success) {
      removedCount++;
    } else {
      trace.err(`Failed to remove extra item: ${deleteResult.error}`);
      await sleep(300);
      etag = await getPlaylistETag(String(playlist.uuid));
    }
  }

  const statusParts = [
    `${addedCount} added`,
    `${removedCount} removed`,
    `${skippedCount} unchanged`,
  ];
  if (duplicateCount > 0) {
    statusParts.push(`${duplicateCount} duplicates`);
  }

  trace.log(`✅ Playlist '${playlistName}' synced: ${statusParts.join(", ")}`);

  syncWidget.completePlaylist(playlistName, {
    added: addedCount,
    removed: removedCount,
    skipped: skippedCount,
    duplicates: duplicateCount,
  });
}
