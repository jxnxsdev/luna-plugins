import Client from "socket.io-client";

export let socket: any = null;
let client_token = "";

export type Song = {
  title: string;
  artist: string;
  duration: number;
  url: string;
  tidalId: string;
  coverUrl: string;
};

export type PlayStatus = {
  isPlaying: boolean;
  playTime: number;
  currentSongIndex: number;
  playQueue: Song[];
};

export let playStatus: PlayStatus = {
  isPlaying: false,
  playTime: 0,
  currentSongIndex: 0,
  playQueue: [],
};

export let isInControl = false;

let controlTimeout: NodeJS.Timeout | null = null;

/** how long without updates until control is lost */
const CONTROL_TIMEOUT_MS = 3_000;

export function initializeSocket(discordId: string, token: string) {
  disconnectSocket();

  client_token = token;
  socket = Client("https://tidal-discord-bridge.jxnxsdev.de", {
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("connect", () => {
    console.log("[socket] connected");
  });

  socket.on("disconnect", () => {
    console.log("[socket] disconnected");
    clearControl();
  });

  socket.on("authRequest", () => {
    socket.emit("authenticate", { discordId });
  });

  socket.on("playStatusUpdate", (status: PlayStatus) => {
    playStatus = status;
    refreshControlLease();
  });

  socket.on("searchSong", (data: { query: string }) => {
    console.log("[socket] searchSong request:", data.query);
    handleSearchSong(data.query);
  });
}

function refreshControlLease() {
  isInControl = true;

  if (controlTimeout) {
    clearTimeout(controlTimeout);
  }

  controlTimeout = setTimeout(() => {
    isInControl = false;
    controlTimeout = null;
  }, CONTROL_TIMEOUT_MS);
}

function clearControl() {
  isInControl = false;
  if (controlTimeout) {
    clearTimeout(controlTimeout);
    controlTimeout = null;
  }
}

export function isSocketConnected() {
  return !!socket?.connected;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  clearControl();
}

export function getPlayStatus(): PlayStatus {
  return playStatus;
}

export function getIsInControl(): boolean {
  return isInControl;
}

async function getSongDetailsFromTidalId(
  tidalId: string,
): Promise<Song | null> {
  try {
    const response = await fetch(
      `https://api.tidal.com/v1/tracks/${tidalId}?countryCode=US`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${client_token}`,
        },
      },
    );

    if (!response.ok) {
      console.error("Failed to fetch Tidal track:", response.statusText);
      return null;
    }

    const data = await response.json();
    const coverId = data.album.cover.replaceAll("-", "/");

    return {
      title: data.title,
      artist: data.artists.map((a: any) => a.name).join(", "),
      duration: data.duration,
      url: `https://tidal.com/browse/track/${data.id}`,
      tidalId: data.id.toString(),
      coverUrl: `https://resources.tidal.com/images/${coverId}/320x320.jpg`,
    };
  } catch (err) {
    console.error("Error fetching Tidal song details:", err);
    return null;
  }
}

async function handleSearchSong(query: string) {
  const urlRegex = /https?:\/\/(www\.)?tidal\.com\/(browse\/)?track\/(\d+)/;
  const match = query.match(urlRegex);

  if (match) {
    const tidalId = match[3];
    const song = await getSongDetailsFromTidalId(tidalId);

    socket.emit(
      "searchSongResult",
      song
        ? { song }
        : {
            query,
            results: [],
          },
    );
    return;
  }

  socket.emit("searchSongResult", {
    query,
    results: [],
  });
}
