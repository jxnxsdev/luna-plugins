import fs from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { shell } from "electron";
import { SpotifyPlaylist, SpotifySong } from "./types/spotify";
import * as webserver from "./webserver.native";

import { tokenResponse } from "./types/tokenResponse";

const appDataPath = path.join(os.homedir(), ".luna", "Syncify");
const dataPath = path.join(appDataPath, "data.json");

async function ensureDataFile(): Promise<{ uuid: string }> {
    try {
        await fs.mkdir(appDataPath, { recursive: true });

        try {
            const data = JSON.parse(await fs.readFile(dataPath, "utf-8"));
            return data;
        } catch {
            const newData = { uuid: uuidv4() };
            await fs.writeFile(dataPath, JSON.stringify(newData, null, 2), "utf-8");
            return newData;
        }
    } catch (err) {
        console.error("Error ensuring data file:", err);
        throw err;
    }
}

export async function openSpotifyTokenGenerator(): Promise<void> {
    const port = await webserver.getServerPort();
    const url = `http://127.0.0.1:${port}/login`;
    try {
        await shell.openExternal(url);
    } catch (err) {
        console.error("Failed to open Spotify token generator:", err);
    }
}

export async function getTokenFromGenerator(): Promise<tokenResponse> {
    let token = await webserver.getAccessToken();
    let refreshToken = await webserver.getRefreshToken();
    console.log("Retrieved tokens from generator:", { token, refreshToken });


    if (!token || !refreshToken) {
        console.error("No token or refresh token found. Please authenticate first.");
        return { token: "", refreshToken: "", success: false };
    }

    return { token, refreshToken, success: true };
}

export async function refreshSpotifyToken(token: string, refreshToken: string, clientId: string, clientSecret: string): Promise<tokenResponse> {
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to refresh token:", errorText);
            return { token: "", refreshToken: "", success: false };
        }

        const data = await response.json();
        return { token: data.access_token, refreshToken: data.refresh_token || "", success: true };
    } catch (err) {
        console.error("Error refreshing Spotify token:", err);
        return { token: "", refreshToken: "", success: false };
    }
}

/**
 * Get all Spotify playlists for the authenticated user
 * Handles pagination to retrieve all playlists beyond the initial 50 limit
 * @param token Spotify access token
 * @returns Array of SpotifyPlaylist objects
 */
export async function getSpotifyPlaylists(token: string): Promise<SpotifyPlaylist[]> {
  try {
    const playlists: SpotifyPlaylist[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await fetch(
        `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch playlists at offset ${offset}: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      for (const item of data.items) {
        playlists.push({
          name: item.name,
          spotifyId: item.id,
          description: item.description || "",
        });
      }

      if (!data.next) break;
      offset += limit;
    }

    return playlists;
  } catch (err) {
    console.error("Error fetching user playlists:", err);
    return [];
  }
}

/**
 * Get all songs from a Spotify playlist
 * Handles pagination to retrieve all songs beyond the initial 50 limit
 * @param spotifyPlaylist Spotify playlist object
 * @param token Spotify access token
 * @returns SpotifyPlaylist object with complete songs array
 */
export async function getSpotifyPlaylistSongs(
  spotifyPlaylist: SpotifyPlaylist,
  token: string
): Promise<SpotifyPlaylist> {
  const songs: SpotifySong[] = [];
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const response = await fetch(
        `https://api.spotify.com/v1/playlists/${spotifyPlaylist.spotifyId}/tracks?limit=${limit}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist songs at offset ${offset}: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      for (const item of data.items) {
        const track = item.track;
        if (track && track.id && track.name && track.artists) {
          songs.push({
            title: track.name,
            // @ts-expect-error
            artists: track.artists.map((artist) => artist.name),
            spotifyId: track.id
          });
        }
      }

      if (!data.next) break; // No more results
      offset += limit;
    }

    return {
      ...spotifyPlaylist,
      songs
    };
  } catch (err) {
    console.error("Error fetching playlist songs:", err);
    return {
      ...spotifyPlaylist,
      songs: []
    };
  }
}

