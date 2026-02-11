import { DataPlaylist } from "./types/dataPlaylist";
import { DataSong } from "./types/dataSong";
import { trace } from ".";

/**
 * Database service for managing localStorage operations
 */
export class DatabaseService {
  private static readonly PLAYLISTS_KEY = "DataPlaylists";
  private static readonly SONGS_KEY = "DataSongs";

  /**
   * Initialize the database
   */
  static async initialize(): Promise<void> {
    try {
      if (!localStorage.getItem(this.PLAYLISTS_KEY)) {
        localStorage.setItem(this.PLAYLISTS_KEY, JSON.stringify([]));
      }

      if (!localStorage.getItem(this.SONGS_KEY)) {
        localStorage.setItem(this.SONGS_KEY, JSON.stringify([]));
      }
    } catch (error) {
      trace.err(
        `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get all playlists from the database
   */
  static async getPlaylists(): Promise<DataPlaylist[]> {
    try {
      await this.initialize();
      const data = localStorage.getItem(this.PLAYLISTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      trace.err(
        `Failed to get playlists: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get all songs from the database
   */
  static async getSongs(): Promise<DataSong[]> {
    try {
      await this.initialize();
      const data = localStorage.getItem(this.SONGS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      trace.err(
        `Failed to get songs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Add a playlist to the database
   */
  static async addPlaylist(playlist: DataPlaylist): Promise<boolean> {
    try {
      const playlists = await this.getPlaylists();

      // Check for duplicates
      if (playlists.some((p) => p.spotifyId === playlist.spotifyId)) {
        trace.warn(
          `Playlist with Spotify ID '${playlist.spotifyId}' already exists`,
        );
        return false;
      }

      playlists.push(playlist);
      localStorage.setItem(this.PLAYLISTS_KEY, JSON.stringify(playlists));
      return true;
    } catch (error) {
      trace.err(
        `Failed to add playlist: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Update a playlist in the database
   */
  static async updatePlaylist(playlist: DataPlaylist): Promise<boolean> {
    try {
      const playlists = await this.getPlaylists();
      const index = playlists.findIndex(
        (p) => p.spotifyId === playlist.spotifyId,
      );

      if (index === -1) {
        trace.warn(
          `Playlist with Spotify ID '${playlist.spotifyId}' not found for update`,
        );
        return false;
      }

      playlists[index] = playlist;
      localStorage.setItem(this.PLAYLISTS_KEY, JSON.stringify(playlists));
      return true;
    } catch (error) {
      trace.err(
        `Failed to update playlist: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Delete a playlist from the database
   */
  static async deletePlaylist(spotifyId: string): Promise<boolean> {
    try {
      const playlists = await this.getPlaylists();
      const filtered = playlists.filter((p) => p.spotifyId !== spotifyId);

      if (filtered.length === playlists.length) {
        trace.warn(
          `Playlist with Spotify ID '${spotifyId}' not found for deletion`,
        );
        return false;
      }

      localStorage.setItem(this.PLAYLISTS_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      trace.err(
        `Failed to delete playlist: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Add a song to the database
   */
  static async addSong(song: DataSong): Promise<boolean> {
    try {
      const songs = await this.getSongs();

      // Check for duplicates
      if (songs.some((s) => s.spotifyId === song.spotifyId)) {
        trace.warn(`Song with Spotify ID '${song.spotifyId}' already exists`);
        return false;
      }

      songs.push(song);
      localStorage.setItem(this.SONGS_KEY, JSON.stringify(songs));
      return true;
    } catch (error) {
      trace.err(
        `Failed to add song: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Add multiple songs to the database (bulk operation)
   */
  static async addSongs(songs: DataSong[]): Promise<number> {
    try {
      const existingSongs = await this.getSongs();
      const existingIds = new Set(existingSongs.map((s) => s.spotifyId));

      // Filter out duplicates
      const newSongs = songs.filter((s) => !existingIds.has(s.spotifyId));

      if (newSongs.length === 0) {
        return 0;
      }

      existingSongs.push(...newSongs);
      localStorage.setItem(this.SONGS_KEY, JSON.stringify(existingSongs));
      return newSongs.length;
    } catch (error) {
      trace.err(
        `Failed to add songs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Get a playlist by Spotify ID
   */
  static async getPlaylistBySpotifyId(
    spotifyId: string,
  ): Promise<DataPlaylist | undefined> {
    const playlists = await this.getPlaylists();
    return playlists.find((p) => p.spotifyId === spotifyId);
  }

  /**
   * Get a playlist by Tidal ID
   */
  static async getPlaylistByTidalId(
    tidalId: string,
  ): Promise<DataPlaylist | undefined> {
    const playlists = await this.getPlaylists();
    return playlists.find((p) => p.tidalId === tidalId);
  }

  /**
   * Get a song by Spotify ID
   */
  static async getSongBySpotifyId(
    spotifyId: string,
  ): Promise<DataSong | undefined> {
    const songs = await this.getSongs();
    return songs.find((s) => s.spotifyId === spotifyId);
  }
}
