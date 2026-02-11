import React, { useEffect, useState } from "react";

import { ReactiveStore } from "@luna/core";
import {
    LunaSettings,
    LunaButtonSetting,
    LunaSelectSetting,
    LunaSelectItem,
    LunaTextSetting
} from "@luna/ui";

import {
    openSpotifyTokenGeneratorNative,
    getTokenFromGeneratorNative,
    getSpotifyPlaylistsNative,
    updateActivePlaylists,
    setCredentialsNative
} from ".";
import { updatePlaylistsNative } from ".";

export const storage = ReactiveStore.getStore("Syncify");
export const settings = await ReactiveStore.getPluginStorage("Syncify", {
    isLoggedIn: false,
    token: "",
    refreshToken: "",
    clientId: "",
    clientSecret: "",
    activePlaylists: [] as string[],
    activePlaylistsSettings: [] as string[],
    popupWasShown: false,
    announcementDismissed: false
});

export const Settings = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(settings.isLoggedIn);
    const [token, setToken] = useState(settings.token);
    const [refreshToken, setRefreshToken] = useState(settings.refreshToken);
    const [activePlaylistsSettings, setActivePlaylistsSettings] = useState(settings.activePlaylistsSettings);
    const [generatorActive, setGeneratorActive] = useState(false);
    const [currentState, setCurrentState] = useState("Log in");
    const [playlists, setPlaylists] = useState<{ spotifyId: string; name: string }[]>([]);
    const [clientId, setClientId] = useState(settings.clientId);
    const [clientSecret, setClientSecret] = useState(settings.clientSecret);

    useEffect(() => {
        setCurrentState(isLoggedIn ? "Log out" : "Log in");
    }, [isLoggedIn]);

    useEffect(() => {
        if (isLoggedIn && token) {
            getSpotifyPlaylistsNative(token)
                .then((playlists) => {
                    console.log("Fetched playlists:", playlists);
                    setPlaylists(playlists);
                })
                .catch((err) => {
                    console.error("Failed to fetch playlists:", err);
                });
        }
    }, [isLoggedIn, token]);

    return (
        <LunaSettings>
            <p>
                You can get the credentials from 
                <a href="https://developer.spotify.com" target="_blank">https://developer.spotify.com</a> -
                visit 
                <a href="https://github.com/jxnxsdev/luna-plugins/blob/main/spotify.md" target="_blank">this page</a>
                for help
            </p>
            <LunaTextSetting
                title="Spotify Client ID"
                desc="Your Spotify Client ID from the Spotify Developer Dashboard."
                value={clientId}
                onChange={(e: any) => {
                    setClientId((settings.clientId = e.target.value));
                }}
            />

            <LunaTextSetting
                title="Spotify Client Secret"
                desc="Your Spotify Client Secret from the Spotify Developer Dashboard."
                value={clientSecret}
                onChange={(e: any) => {
                    setClientSecret((settings.clientSecret = e.target.value));
                }}
            />

            <LunaButtonSetting
                title="Spotify Login"
                desc="Log in to your Spotify account to sync your playlists."
                onClick={async () => {
                    if (isLoggedIn) {
                        setIsLoggedIn((settings.isLoggedIn = false));
                        setToken((settings.token = ""));
                        setRefreshToken((settings.refreshToken = ""));
                        setCurrentState("Log in");
                    } else {
                        if (!generatorActive) {
                            setCredentialsNative(clientId, clientSecret);
                            openSpotifyTokenGeneratorNative();
                            setGeneratorActive(true);
                            setCurrentState("Retrieve Token");
                        } else {
                            try {
                                const response = await getTokenFromGeneratorNative();
                                if (response.success) {
                                    setToken((settings.token = response.token));
                                    setRefreshToken((settings.refreshToken = response.refreshToken));
                                    setIsLoggedIn((settings.isLoggedIn = true));
                                    setCurrentState("Log out");
                                } else {
                                    console.error("Failed to retrieve token from generator.");
                                }
                            } catch (error) {
                                console.error("Error retrieving token:", error);
                            }
                        }
                    }
                }}
            >
                {currentState}
            </LunaButtonSetting>

            <LunaSelectSetting
                id="active-playlists"
                title="Active Playlists"
                desc="Select the playlists you want to sync with Tidal."
                value={activePlaylistsSettings}
                onChange={(newValues: any) => {
                    setActivePlaylistsSettings((settings.activePlaylistsSettings = newValues.target.value));
                    updateActivePlaylists();
                }}
                multiple
            >
                {playlists.map((playlist) => (
                    <LunaSelectItem key={playlist.spotifyId} value={playlist.spotifyId}>
                        {playlist.name}
                    </LunaSelectItem>
                ))}
            </LunaSelectSetting>
            <LunaButtonSetting
                title="Update Playlists"
                desc="Manually update your playlists."
                onClick={async () => {
                    await updatePlaylistsNative();
                }}
            />
            <LunaButtonSetting
                title="Clear all Playlists"
                desc="Clears the Sync for all playlists. The Synced playlists will not be deleted, but will no longer be synced with Tidal. You can re-add them at any time."
                onClick={async () => {
                    setActivePlaylistsSettings((settings.activePlaylistsSettings = []));
                    settings.activePlaylists = [];
                    updateActivePlaylists();
                }}
            />
        </LunaSettings>
    );
};