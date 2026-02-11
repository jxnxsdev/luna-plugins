import { LunaUnload, Tracer } from "@luna/core";
import { settings } from "./Settings";
import * as spotify from "./spotify.native";
import { DataPlaylist } from "./types/dataPlaylist";
import { DataSong } from "./types/dataSong";
import { SpotifyPlaylist } from "./types/spotify";
import { updatePlaylists } from "./playlistUpdater";
import * as lib from "@luna/lib";
import {
  startWebServer,
  stopWebServer,
  setCredentials,
} from "./webserver.native";
import { DatabaseService } from "./database";
import { createUserErrorMessage } from "./utils";
import { syncWidget } from "./syncWidget";

export { Settings } from "./Settings";

export const unloads = new Set<LunaUnload>();
export const { trace, errSignal } = Tracer("[Syncify]");

export const openSpotifyTokenGeneratorNative = () =>
  spotify.openSpotifyTokenGenerator();
export const getTokenFromGeneratorNative = () =>
  spotify.getTokenFromGenerator();
export const refreshSpotifyTokenNative = (
  token: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) => spotify.refreshSpotifyToken(token, refreshToken, clientId, clientSecret);
export const getSpotifyPlaylistsNative = (token: string) =>
  spotify.getSpotifyPlaylists(token);
export const getSpotifyPlaylistSongsNative = (
  spotifyPlaylist: SpotifyPlaylist,
  token: string,
) => spotify.getSpotifyPlaylistSongs(spotifyPlaylist, token);
export const updatePlaylistsNative = () => updatePlaylists();
export const setCredentialsNative = (
  clientId: string,
  clientSecret: string,
): void => {
  settings.clientId = clientId;
  settings.clientSecret = clientSecret;
  setCredentials(clientId, clientSecret);
};

/**
 * Initialize the Syncify plugin
 * Starts web server, initializes database, and handles first-run popup
 */
async function initializePlugin(): Promise<void> {
  try {
    await startWebServer(2402);
    unloads.add(() => stopWebServer());
    await DatabaseService.initialize();
    await refreshTokenIfNeeded();

    if (!settings.popupWasShown) {
      settings.isLoggedIn = false;
      settings.token = "";
      settings.refreshToken = "";
      settings.popupWasShown = true;
    }
    
    if (!settings.announcementDismissed) {
      await showPopup();
    } else if (settings.isLoggedIn && settings.activePlaylists.length > 0) {
      await updatePlaylists();
    }
  } catch (err) {
    const errorMsg = createUserErrorMessage(
      "Failed to initialize Syncify plugin",
      err,
    );
    trace.err(errorMsg);
  }
}

/**
 * Show first-run popup notification about OAuth changes
 */
async function showPopup(): Promise<void> {
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.background = "#1e1e1e";
  popup.style.border = "1px solid #333";
  popup.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.6)";
  popup.style.padding = "24px 32px";
  popup.style.zIndex = "10000";
  popup.style.maxWidth = "90%";
  popup.style.width = "550px";
  popup.style.maxHeight = "85vh";
  popup.style.borderRadius = "12px";
  popup.style.fontFamily = "Segoe UI, sans-serif";
  popup.style.color = "#eee";
  popup.style.backdropFilter = "blur(6px)";
  popup.style.backgroundClip = "padding-box";
  popup.style.overflowY = "auto";

  popup.innerHTML = `
    <div style="text-align: left; font-size: 14px; line-height: 1.6;">
      <h2 style="margin-top: 0; margin-bottom: 16px; font-size: 20px; color: #fff;">Important Update: Syncify Plugin Changes</h2>
      
      <h3 style="margin-top: 20px; margin-bottom: 8px; color: #4CAF50; font-size: 16px;">The Good News</h3>
      <p style="margin: 8px 0;">
        I've just released a big update that fixes a lot of bugs and introduces a much more improved syncing UI. Playlist syncing is now more reliable and works the way it always should have.
      </p>
      
      <h3 style="margin-top: 20px; margin-bottom: 8px; color: #f44336; font-size: 16px;">The Bad News (thanks, Spotify)</h3>
      <p style="margin: 8px 0;">
        As of the 09.03.2026, the Syncify plugin can no longer be used for free. Spotify has changed how their Developer API works and you now need an active Spotify Premium subscription just to create or use API applications. This change also affects and breaks already existing apps. This is a massive <strong>fuck you</strong> from Spotify to developers who build tools on their platform. It's another deliberate move to lock users in and kill off anything that makes leaving Spotify easier. Changes like this don't happen by accident. Tools like Syncify, which make it easy to move your playlists away from Spotify for free are surely the reason this restriction exists in the first place. Yet another reason to move away from this platform.
      </p>
      
      <h3 style="margin-top: 20px; margin-bottom: 8px; font-size: 16px;">What Does This Mean Going Forward?</h3>
      <p style="margin: 8px 0;">
        Syncify will continue to work for users who have an active Spotify Premium subscription. However, I will no longer actively maintain or update the plugin. I'm not interested in paying for two streaming services just to keep an integration alive, especially when one of them keeps pulling moves like this and funding things I fundamentally disagree with. As long as Spotify doesn't break their API again, the plugin should keep working for Premium users for the foreseeable future.
      </p>
      
      <h3 style="margin-top: 20px; margin-bottom: 8px; font-size: 16px;">What You Should Do Now</h3>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li style="margin: 4px 0;">If you don't want to pay for Spotify Premium, transfer all of your important playlists now, while it's still possible.</li>
        <li style="margin: 4px 0;">If you're reading this after the API has been locked behind Premium, you can still use Spotify's one month free trial, transfer everything, and cancel before being charged. This only works once per account. After that, at least one paid month is required.</li>
        <li style="margin: 4px 0;"><strong>Put pressure on Spotify to revert this decision.</strong> Contact them through their support channels, social media, and community forums. Let them know this change is harmful to developers and users alike. The more voices speak up, the more likely they are to reconsider.</li>
      </ul>
      
      <h3 style="margin-top: 20px; margin-bottom: 8px; font-size: 16px;">About Future Features</h3>
      <p style="margin: 8px 0;">
        I planned to add support for:
      </p>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li style="margin: 4px 0;">syncing liked songs</li>
        <li style="margin: 4px 0;">syncing discovery and algorithmic playlists</li>
        <li style="margin: 4px 0;">syncing from tidal to spotify</li>
      </ul>
      <p style="margin: 8px 0;">
        At this point, there's pretty much no reason to continue development, since most users will no longer be able to use the plugin anyway.
      </p>
      
      <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
        <button id="popup-close-btn" style="
          padding: 10px 20px;
          font-size: 14px;
          background-color: #3a3a3a;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        ">Close</button>
        <button id="popup-do-not-show-btn" style="
          padding: 10px 20px;
          font-size: 14px;
          background-color: #555;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        ">Close and Do Not Show Again</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const closeBtn = document.getElementById("popup-close-btn");
  const doNotShowBtn = document.getElementById("popup-do-not-show-btn");
  
  const closePopup = () => {
    popup.style.opacity = "0";
    popup.style.transition = "opacity 0.3s ease";
    setTimeout(() => popup.remove(), 300);
  };

  if (closeBtn) {
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.backgroundColor = "#555";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.backgroundColor = "#3a3a3a";
    });
    closeBtn.addEventListener("click", () => {
      closePopup();
    });
  }
  
  if (doNotShowBtn) {
    doNotShowBtn.addEventListener("mouseenter", () => {
      doNotShowBtn.style.backgroundColor = "#777";
    });
    doNotShowBtn.addEventListener("mouseleave", () => {
      doNotShowBtn.style.backgroundColor = "#555";
    });
    doNotShowBtn.addEventListener("click", () => {
      settings.announcementDismissed = true;
      closePopup();
    });
  }
}

/**
 * Refresh Spotify access token if needed
 * Uses refresh token to obtain new access token
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  const { token, refreshToken, clientId, clientSecret } = settings;

  if (!token || !refreshToken) {
    return;
  }

  if (!clientId || !clientSecret) {
    trace.warn("Cannot refresh Spotify token: Missing client credentials");
    return;
  }

  try {
    const response = await spotify.refreshSpotifyToken(
      token,
      refreshToken,
      clientId,
      clientSecret,
    );
    if (response.success) {
      settings.token = response.token;
      if (response.refreshToken) {
        settings.refreshToken = response.refreshToken;
      }
      trace.log("✅ Successfully refreshed Spotify token");
    } else {
      trace.err("❌ Failed to refresh Spotify token. Please log in again.");
    }
  } catch (error) {
    const errorMsg = createUserErrorMessage(
      "Error refreshing Spotify token",
      error,
    );
    trace.err(errorMsg);
  }
}

initializePlugin();

export const getDataPlaylists = (): Promise<DataPlaylist[]> =>
  DatabaseService.getPlaylists();
export const getDataSongs = (): Promise<DataSong[]> =>
  DatabaseService.getSongs();
export const addDataPlaylist = (playlist: DataPlaylist): Promise<boolean> =>
  DatabaseService.addPlaylist(playlist);
export const editDataPlaylist = (playlist: DataPlaylist): Promise<boolean> =>
  DatabaseService.updatePlaylist(playlist);
export const addDataSong = (song: DataSong): Promise<boolean> =>
  DatabaseService.addSong(song);

/**
 * Add a playlist to the sync configuration
 * Creates Tidal playlist if it doesn't exist
 * @param spotifyId Spotify playlist ID
 */
async function addPlaylistToSync(spotifyId: string): Promise<void> {
  try {
    const existingDataPlaylist =
      await DatabaseService.getPlaylistBySpotifyId(spotifyId);
    if (existingDataPlaylist) {
      if (settings.activePlaylists.includes(existingDataPlaylist.tidalId)) {
        trace.warn(
          `⚠️ Playlist with Spotify ID '${spotifyId}' is already in the active playlists`,
        );
        return;
      }
      settings.activePlaylists.push(existingDataPlaylist.tidalId);
      trace.log(
        `✅ Re-added existing playlist '${existingDataPlaylist.name}' to sync`,
      );
      return;
    }

    const playlists = await getSpotifyPlaylistsNative(settings.token);
    const playlist = playlists.find((p) => p.spotifyId === spotifyId);
    if (!playlist) {
      throw new Error(
        `Playlist with Spotify ID '${spotifyId}' not found on Spotify`,
      );
    }

    trace.log(`📝 Creating Tidal playlist '${playlist.name}'...`);
    const creds = await lib.getCredentials();
    const url = `https://openapi.tidal.com/v2/playlists`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            accessType: "UNLISTED",
            description: playlist.description || `Synced from Spotify`,
            name: playlist.name,
          },
          type: "playlists",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create Tidal playlist: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();
    const tidalId = data.data.id;
    const newDataPlaylist: DataPlaylist = {
      name: playlist.name,
      spotifyId: playlist.spotifyId,
      tidalId,
      songsData: [],
    };

    const added = await addDataPlaylist(newDataPlaylist);
    if (added) {
      settings.activePlaylists.push(tidalId);
      trace.log(
        `✅ Successfully created and added playlist '${playlist.name}' to sync`,
      );
    } else {
      trace.err(`Failed to save playlist '${playlist.name}' to database`);
    }
  } catch (error) {
    const errorMsg = createUserErrorMessage(
      `Failed to add playlist to sync`,
      error,
    );
    trace.err(errorMsg);
  }
}

/**
 * Remove a playlist from the sync configuration
 * @param tidalId Tidal playlist ID
 */
async function removePlaylistFromSync(tidalId: string): Promise<void> {
  try {
    const existingDataPlaylist =
      await DatabaseService.getPlaylistByTidalId(tidalId);
    if (!existingDataPlaylist) {
      trace.warn(
        `⚠️ Playlist with Tidal ID '${tidalId}' not found in database`,
      );
      settings.activePlaylists = settings.activePlaylists.filter(
        (id) => id !== tidalId,
      );
      return;
    }

    settings.activePlaylists = settings.activePlaylists.filter(
      (id) => id !== tidalId,
    );
    trace.log(`✅ Removed playlist '${existingDataPlaylist.name}' from sync`);
  } catch (error) {
    const errorMsg = createUserErrorMessage(
      `Failed to remove playlist from sync`,
      error,
    );
    trace.err(errorMsg);
  }
}

/**
 * Update active playlists based on settings
 * Syncs the active playlists state with user settings
 */
export async function updateActivePlaylists(): Promise<void> {
  try {
    const activePlaylistsSettings = settings.activePlaylistsSettings;
    const activePlaylists = settings.activePlaylists;

    trace.log("🔄 Updating active playlists...");

    for (const tidalId of activePlaylists) {
      const existingDataPlaylist =
        await DatabaseService.getPlaylistByTidalId(tidalId);
      if (!existingDataPlaylist) {
        await removePlaylistFromSync(tidalId);
        continue;
      }

      if (!activePlaylistsSettings.includes(existingDataPlaylist.spotifyId)) {
        await removePlaylistFromSync(existingDataPlaylist.tidalId);
      }
    }

    for (const spotifyId of activePlaylistsSettings) {
      const existingDataPlaylist =
        await DatabaseService.getPlaylistBySpotifyId(spotifyId);
      if (existingDataPlaylist) {
        if (!activePlaylists.includes(existingDataPlaylist.tidalId)) {
          await addPlaylistToSync(existingDataPlaylist.spotifyId);
        }
      } else {
        await addPlaylistToSync(spotifyId);
      }
    }

    trace.log("✅ Active playlists updated successfully");
  } catch (error) {
    const errorMsg = createUserErrorMessage(
      "Failed to update active playlists",
      error,
    );
    trace.err(errorMsg);
  }
}
