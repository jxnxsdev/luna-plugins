import { LunaUnload, Tracer } from "@luna/core";
import { MediaItem } from "@luna/lib";
import { settings } from "./Settings";
import * as spotify from "./spotify.native";
import { DataSong } from "./types/dataSong";
import { DataPlaylist } from "./types/dataPlaylist";
import { SpotifyPlaylist } from "./types/spotify";
import { SpotifyToDataSong } from "./converter";
import { updatePlaylists } from "./playlistUpdater";
import * as lib from "@luna/lib";
import { startWebServer, stopWebServer, setCredentials } from "./webserver.native";
import { start } from "repl";
import { IpcRenderer } from "electron";

export { Settings } from "./Settings";

export const unloads = new Set<LunaUnload>();
export const { trace, errSignal } = Tracer("[Syncify]");

export const openSpotifyTokenGeneratorNative = () => spotify.openSpotifyTokenGenerator();
export const getTokenFromGeneratorNative = () => spotify.getTokenFromGenerator();
export const refreshSpotifyTokenNative = (token: string, refreshToken: string, clientId: string, clientSecret: string) => spotify.refreshSpotifyToken(token, refreshToken, clientId, clientSecret);
export const getSpotifyPlaylistsNative = (token: string) => spotify.getSpotifyPlaylists(token);
export const getSpotifyPlaylistSongsNative = (spotifyPlaylist: SpotifyPlaylist, token: string) => spotify.getSpotifyPlaylistSongs(spotifyPlaylist, token);
export const updatePlaylistsNative = () => updatePlaylists();
export const setCredentialsNative = (clientId: string, clientSecret: string) => {
    settings.clientId = clientId;
    settings.clientSecret = clientSecret;
    setCredentials(clientId, clientSecret);
};

async function initializePlugin() {
    await startWebServer(2402);
    unloads.add(() => stopWebServer());
    initializeDatabase();
    await refreshTokenIfNeeded();
    await updatePlaylists();

    if (!settings.popupWasShown) {
        settings.isLoggedIn = false;
        settings.token = "";
        settings.refreshToken = "";
        settings.popupWasShown = true;
        await showPopup();
    }
};

async function showPopup() {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.background = '#1e1e1e';
  popup.style.border = '1px solid #333';
  popup.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6)';
  popup.style.padding = '24px 32px';
  popup.style.zIndex = '10000';
  popup.style.maxWidth = '90%';
  popup.style.width = '500px';
  popup.style.borderRadius = '12px';
  popup.style.fontFamily = 'Segoe UI, sans-serif';
  popup.style.color = '#eee';
  popup.style.textAlign = 'center';
  popup.style.backdropFilter = 'blur(6px)';
  popup.style.backgroundClip = 'padding-box';

  popup.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 16px;">
      <strong>Syncify has been updated</strong><br><br>
      Syncify now requires you to provide your own OAuth credentials.<br>
      This is because Spotify limits requests per application and not per user.<br>
      You will find a link to a guide inside the Syncify settings.
    </div>
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
  `;

  document.body.appendChild(popup);

  // Add close functionality with slight fade-out
  const closeBtn = document.getElementById('popup-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#555';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = '#3a3a3a';
    });
    closeBtn.addEventListener('click', () => {
      popup.style.opacity = '0';
      popup.style.transition = 'opacity 0.3s ease';
      setTimeout(() => popup.remove(), 300);
    });
  }
}

export async function refreshTokenIfNeeded() {
    const { token, refreshToken, clientId, clientSecret } = settings;
    if (token && refreshToken && clientId && clientSecret) {
        const response = await spotify.refreshSpotifyToken(token, refreshToken, settings.clientId, settings.clientSecret);
        if (response.success) {
            settings.token = response.token;
            trace.log("Successfully refreshed Spotify token.");
        } else {
            console.error("Failed to refresh Spotify token.");
        }
    }
}

initializePlugin().catch(err => {
    console.error("Failed to initialize Syncify plugin:", err);
});

async function initializeDatabase() {
    if(!localStorage.getItem("DataPlaylists") ) {
        localStorage.setItem("DataPlaylists", JSON.stringify([]));
    }

    if(!localStorage.getItem("DataSongs") ) {
        localStorage.setItem("DataSongs", JSON.stringify([]));
    }
}

export async function getDataPlaylists(): Promise<DataPlaylist[]> {
    await initializeDatabase();
    const data = localStorage.getItem("DataPlaylists");
    return data ? JSON.parse(data) : [];
}

export async function getDataSongs(): Promise<DataSong[]> {
    await initializeDatabase();
    const data = localStorage.getItem("DataSongs");
    return data ? JSON.parse(data) : [];
}

export async function addDataPlaylist(playlist: DataPlaylist): Promise<void> {
    const playlists = await getDataPlaylists();
    playlists.push(playlist);
    localStorage.setItem("DataPlaylists", JSON.stringify(playlists));
}

export async function editDataPlaylist(playlist: DataPlaylist): Promise<void> {
    const playlists = await getDataPlaylists();
    const index = playlists.findIndex(p => p.spotifyId === playlist.spotifyId);
    if (index !== -1) {
        playlists[index] = playlist;
        localStorage.setItem("DataPlaylists", JSON.stringify(playlists));
    } else {
        console.warn("Playlist not found for editing:", playlist);
    }
}

export async function addDataSong(song: DataSong): Promise<void> {
    const songs = await getDataSongs();
    songs.push(song);
    localStorage.setItem("DataSongs", JSON.stringify(songs));
}

async function addPlaylistToSync(spotifyId: string): Promise<void> {
    const dataPlaylists = await getDataPlaylists();
    const existingDataPlaylist = dataPlaylists.find(p => p.spotifyId === spotifyId);
    if (existingDataPlaylist) {
        if (settings.activePlaylists.includes(existingDataPlaylist.tidalId)) {
            trace.warn(`Playlist with Spotify ID '${spotifyId}' is already in the active playlists.`);
            return;
        }
        settings.activePlaylists.push(existingDataPlaylist.tidalId);
    }

    const playlists = await getSpotifyPlaylistsNative(settings.token);
    const playlist = playlists.find(p => p.spotifyId === spotifyId);
    if (!playlist) {
        trace.err(`Playlist with Spotify ID '${spotifyId}' not found.`);
        return;
    }

    // create tidal playlist
    const creds = await lib.getCredentials();
    const url = `https://openapi.tidal.com/v2/playlists`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${creds.token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            data: {
                attributes: {
                    accessType: "UNLISTED",
                    description: playlist.description,
                    name: playlist.name
                },
                type: "playlists"
            }
        })
    });
    if (!response.ok) {
        trace.err("Failed to create Tidal playlist:", response.statusText);
        return;
    }

    const data = await response.json();
    const tidalId = data.data.id;
    const newDataPlaylist: DataPlaylist = {
        name: playlist.name,
        spotifyId: playlist.spotifyId,
        tidalId,
        songsData: []
    };

    await addDataPlaylist(newDataPlaylist);
    settings.activePlaylists.push(tidalId);
}

async function removePlaylistFromSync(tidalId: string): Promise<void> {
    const dataPlaylists = await getDataPlaylists();
    console.log("Data Playlists:", dataPlaylists);
    const existingDataPlaylist = dataPlaylists.find(p => p.tidalId === tidalId);
    if (!existingDataPlaylist) {
        trace.err(`Playlist with Tidal ID '${tidalId}' not found in data playlists.`);
        return;
    }

    settings.activePlaylists = settings.activePlaylists.filter(id => id !== existingDataPlaylist.tidalId);
    trace.log(`Removed playlist with Spotify ID '${tidalId}' from active playlists.`);
}

export async function updateActivePlaylists(): Promise<void> {
    const activePlaylistsSettings = settings.activePlaylistsSettings; // This is the new state for active playlists settings
    const activePlaylists = settings.activePlaylists; // This is the current state of active playlists

    // Remove playlists that are no longer in the settings
    for (const tidalId of activePlaylists) {
        // convert tidalId to spotifyId
        const dataPlaylists = await getDataPlaylists();
        const existingDataPlaylist = dataPlaylists.find(p => p.tidalId === tidalId);
        if (!existingDataPlaylist) {
            removePlaylistFromSync(tidalId);
            continue;
        }

        if (!activePlaylistsSettings.includes(existingDataPlaylist.spotifyId)) {
            await removePlaylistFromSync(existingDataPlaylist.tidalId);
        }
    }

    // Add new playlists that are in the settings but not in the current active playlists
    for (const spotifyId of activePlaylistsSettings) {
        const dataPlaylists = await getDataPlaylists();
        const existingDataPlaylist = dataPlaylists.find(p => p.spotifyId === spotifyId);
        if (existingDataPlaylist) {
            if (!activePlaylists.includes(existingDataPlaylist.tidalId)) {
                await addPlaylistToSync(existingDataPlaylist.spotifyId);
            }
        } else {
            await addPlaylistToSync(spotifyId);
        }
    }
}