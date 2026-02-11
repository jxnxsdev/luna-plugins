import { trace } from ".";

export interface PlaylistProgress {
  name: string;
  status:
    | "pending"
    | "syncing"
    | "resolving"
    | "adding"
    | "completed"
    | "error";
  totalSongs: number;
  processedSongs: number;
  failedSongs: string[];
  addedCount?: number;
  removedCount?: number;
  skippedCount?: number;
  duplicateCount?: number;
  currentOperation?: string;
  currentSong?: string;
}

export interface SyncProgress {
  isActive: boolean;
  currentPlaylist: string;
  playlists: Map<string, PlaylistProgress>;
  isConverting: boolean;
  conversionProgress?: {
    current: number;
    total: number;
    currentSong: string;
  };
}

type StatusConfig = { icon: string; color: string; spin: boolean };

class SyncWidget {
  private widget: HTMLDivElement | null = null;
  private progress: SyncProgress = {
    isActive: false,
    currentPlaylist: "",
    playlists: new Map(),
    isConverting: false,
  };
  private autoHideTimeout: NodeJS.Timeout | null = null;

  private static readonly STATUS_ICONS: Record<
    PlaylistProgress["status"],
    StatusConfig
  > = {
    pending: { icon: "⏸", color: "#64748b", spin: false },
    syncing: { icon: "♪", color: "#3b82f6", spin: false },
    resolving: { icon: "🔍", color: "#8b5cf6", spin: true },
    adding: { icon: "➕", color: "#10b981", spin: true },
    completed: { icon: "✓", color: "#4ade80", spin: false },
    error: { icon: "⚠", color: "#ef4444", spin: false },
  };

  /**
   * Shows the sync widget with slide-in animation
   */
  show(): void {
    if (this.widget) return;

    this.widget = document.createElement("div");
    this.widget.id = "syncify-progress-widget";
    this.widget.style.cssText = `
      position: fixed;
      top: 20px;
      left: -400px;
      width: 380px;
      max-height: 80vh;
      background: linear-gradient(135deg, rgba(30, 30, 30, 0.85) 0%, rgba(42, 42, 42, 0.85) 100%);
      border: 1px solid rgba(68, 68, 68, 0.6);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      padding: 20px;
      z-index: 10001;
      font-family: 'Segoe UI', sans-serif;
      color: #eee;
      transition: left 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
      overflow-y: auto;
      backdrop-filter: blur(20px);
    `;

    if (!document.getElementById("syncify-spinner-style")) {
      const style = document.createElement("style");
      style.id = "syncify-spinner-style";
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    this.widget.innerHTML = this.renderContent();
    document.body.appendChild(this.widget);

    requestAnimationFrame(() => {
      if (this.widget) {
        this.widget.style.left = "20px";
      }
    });

    this.attachEventListeners();
  }

  /**
   * Hides the widget with slide-out animation and removes it from DOM
   */
  hide(): void {
    if (!this.widget) return;

    this.widget.style.left = "-400px";
    setTimeout(() => {
      if (this.widget) {
        this.widget.remove();
        this.widget = null;
      }
    }, 400);
  }

  /**
   * Initializes sync progress for multiple playlists and displays the widget
   * @param playlistNames Array of playlist names to sync
   */
  startSync(playlistNames: string[]): void {
    this.progress.isActive = true;
    this.progress.playlists.clear();

    for (const name of playlistNames) {
      this.progress.playlists.set(name, {
        name,
        status: "pending",
        totalSongs: 0,
        processedSongs: 0,
        failedSongs: [],
      });
    }

    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
      this.autoHideTimeout = null;
    }

    this.show();
    this.update();
  }

  /**
   * Updates progress data for a specific playlist
   * @param playlistName Name of the playlist to update
   * @param data Partial playlist progress data to merge
   */
  updatePlaylistProgress(
    playlistName: string,
    data: Partial<PlaylistProgress>,
  ): void {
    const existing = this.progress.playlists.get(playlistName);
    if (existing) {
      this.progress.playlists.set(playlistName, {
        ...existing,
        ...data,
      });
      this.update();
    }
  }

  /**
   * Sets the currently active playlist being synced
   * @param name Playlist name
   */
  setCurrentPlaylist(name: string): void {
    this.progress.currentPlaylist = name;
    const playlist = this.progress.playlists.get(name);
    if (playlist) {
      playlist.status = "syncing";
    }
    this.update();
  }

  /**
   * Updates the song conversion progress indicator
   * @param current Current song index
   * @param total Total number of songs to convert
   * @param currentSong Name of the song currently being converted
   */
  setConversionProgress(
    current: number,
    total: number,
    currentSong: string,
  ): void {
    this.progress.isConverting = true;
    this.progress.conversionProgress = { current, total, currentSong };
    this.update();
  }

  /**
   * Clears the conversion progress indicator
   */
  clearConversionProgress(): void {
    this.progress.isConverting = false;
    this.progress.conversionProgress = undefined;
    this.update();
  }

  /**
   * Updates the current operation (resolving/adding) for a playlist with per-song progress
   * @param playlistName Name of the playlist
   * @param operation Type of operation: 'resolving' or 'adding'
   * @param current Current song index
   * @param total Total number of songs
   * @param currentSong Name of the song currently being processed
   */
  setPlaylistOperation(
    playlistName: string,
    operation: "resolving" | "adding",
    current: number,
    total: number,
    currentSong: string,
  ): void {
    const playlist = this.progress.playlists.get(playlistName);
    if (playlist) {
      playlist.status = operation;
      playlist.processedSongs = current;
      playlist.totalSongs = total;
      playlist.currentSong = currentSong;
      playlist.currentOperation =
        operation === "resolving" ? "Resolving songs" : "Adding to playlist";
      this.update();
    }
  }

  /**
   * Marks a playlist as completed and displays final sync statistics
   * @param playlistName Name of the playlist
   * @param stats Object containing sync statistics (added, removed, skipped, duplicates)
   */
  completePlaylist(
    playlistName: string,
    stats: {
      added: number;
      removed: number;
      skipped: number;
      duplicates: number;
    },
  ): void {
    const playlist = this.progress.playlists.get(playlistName);
    if (playlist) {
      playlist.status = "completed";
      playlist.addedCount = stats.added;
      playlist.removedCount = stats.removed;
      playlist.skippedCount = stats.skipped;
      playlist.duplicateCount = stats.duplicates;
      this.update();
    }
  }

  /**
   * Marks a playlist as having encountered an error
   * @param playlistName Name of the playlist
   * @param error Error message
   */
  errorPlaylist(playlistName: string, error: string): void {
    const playlist = this.progress.playlists.get(playlistName);
    if (playlist) {
      playlist.status = "error";
      playlist.failedSongs.push(error);
      this.update();
    }
  }

  /**
   * Adds a song to the failed songs list for a playlist
   * @param playlistName Name of the playlist
   * @param songName Name of the song that failed
   */
  addFailedSong(playlistName: string, songName: string): void {
    const playlist = this.progress.playlists.get(playlistName);
    if (playlist) {
      playlist.failedSongs.push(songName);
      this.update();
    }
  }

  /**
   * Marks the sync process as complete and schedules auto-hide after 5 seconds
   */
  endSync(): void {
    this.progress.isActive = false;
    this.progress.currentPlaylist = "";
    this.progress.isConverting = false;
    this.update();

    this.autoHideTimeout = setTimeout(() => this.hide(), 5000);
  }

  /**
   * Re-renders the widget content and reattaches event listeners
   */
  private update(): void {
    if (!this.widget) return;
    this.widget.innerHTML = this.renderContent();
    this.attachEventListeners();
  }

  /**
   * Renders the complete widget HTML content including header, progress bars, and playlist items
   * @returns HTML string for the widget content
   */
  private renderContent(): string {
    const playlists = Array.from(this.progress.playlists.values());
    const completedCount = playlists.filter(
      (p) => p.status === "completed",
    ).length;
    const totalCount = playlists.length;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: ${this.progress.isActive ? "#3b82f6" : "#4ade80"}; font-size: 18px; display: inline-block; ${this.progress.isActive ? "animation: spin 1s linear infinite;" : ""}">${this.progress.isActive ? "↻" : "✓"}</span>
          <h3 style="margin: 0; font-size: 16px; font-weight: 600;">
            ${this.progress.isActive ? "Syncing Playlists" : "Sync Complete"}
          </h3>
        </div>
        <button id="syncify-close-btn" style="
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        " title="Hide">×</button>
      </div>

      ${
        this.progress.isActive
          ? `
        <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 13px; color: #aaa; margin-bottom: 8px;">
            Progress: ${completedCount} / ${totalCount} playlists
          </div>
          <div style="background: rgba(0, 0, 0, 0.3); border-radius: 6px; height: 8px; overflow: hidden;">
            <div style="
              background: linear-gradient(90deg, #3b82f6, #8b5cf6);
              height: 100%;
              width: ${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%;
              transition: width 0.3s ease;
              border-radius: 6px;
            "></div>
          </div>
        </div>
      `
          : ""
      }

      ${
        this.progress.isConverting
          ? `
        <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #c4b5fd;">
            <span style="display: inline-block; animation: spin 1s linear infinite;">⇄</span>
            <span>Converting Songs</span>
          </div>
          <div style="font-size: 12px; color: #a78bfa; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${this.progress.conversionProgress?.currentSong || ""}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #9ca3af;">
            <span>${this.progress.conversionProgress?.current || 0} / ${this.progress.conversionProgress?.total || 0}</span>
            <span>${Math.round(((this.progress.conversionProgress?.current || 0) / (this.progress.conversionProgress?.total || 1)) * 100)}%</span>
          </div>
        </div>
      `
          : ""
      }

      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${playlists.map((playlist) => this.renderPlaylistItem(playlist)).join("")}
      </div>

      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        #syncify-close-btn:hover {
          color: #fff !important;
        }
        .syncify-playlist-item {
          transition: background 0.2s;
        }
        .syncify-playlist-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }
      </style>
    `;
  }

  /**
   * Renders a single playlist item with its current status and progress
   * @param playlist Playlist progress data
   * @returns HTML string for the playlist item
   */
  private renderPlaylistItem(playlist: PlaylistProgress): string {
    const statusConfig = SyncWidget.STATUS_ICONS[playlist.status];

    const isActive = ["syncing", "resolving", "adding"].includes(
      playlist.status,
    );

    return `
      <div class="syncify-playlist-item" style="
        background: ${isActive ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.02)"};
        border: 1px solid ${isActive ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.05)"};
        border-radius: 8px;
        padding: 12px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="color: ${statusConfig.color}; font-size: 14px; width: 16px; display: inline-block; text-align: center; ${statusConfig.spin ? "animation: spin 1s linear infinite;" : ""}">${statusConfig.icon}</span>
          <span style="font-size: 13px; font-weight: 500; flex: 1; color: ${statusConfig.color};">
            ${playlist.name}
          </span>
        </div>

        ${
          playlist.currentOperation && playlist.currentSong
            ? `
          <div style="font-size: 11px; color: #a0a0a0; margin-bottom: 6px;">
            <div style="margin-bottom: 2px; font-weight: 500;">${playlist.currentOperation}</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #8080ff;">
              ${playlist.currentSong}
            </div>
            <div style="margin-top: 4px; color: #888;">
              ${playlist.processedSongs} / ${playlist.totalSongs}
            </div>
          </div>
        `
            : ""
        }

        ${
          playlist.status === "completed"
            ? `
          <div style="font-size: 11px; color: #9ca3af; display: flex; flex-wrap: wrap; gap: 8px;">
            ${playlist.addedCount !== undefined ? `<span>+${playlist.addedCount} added</span>` : ""}
            ${playlist.removedCount !== undefined && playlist.removedCount > 0 ? `<span>-${playlist.removedCount} removed</span>` : ""}
            ${playlist.skippedCount !== undefined && playlist.skippedCount > 0 ? `<span>${playlist.skippedCount} unchanged</span>` : ""}
            ${playlist.duplicateCount !== undefined && playlist.duplicateCount > 0 ? `<span>${playlist.duplicateCount} duplicates</span>` : ""}
          </div>
        `
            : ""
        }

        ${
          playlist.failedSongs.length > 0
            ? `
          <div style="margin-top: 8px; font-size: 11px; color: #fca5a5;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 500; margin-bottom: 4px;">
              <span>⚠</span>
              <span>${playlist.failedSongs.length} failed</span>
            </div>
            <div style="max-height: 80px; overflow-y: auto; padding-left: 8px;">
              ${playlist.failedSongs
                .slice(0, 5)
                .map(
                  (song) =>
                    `<div style="margin-bottom: 2px; display: flex; gap: 4px;"><span style="font-size: 10px; margin-top: 2px;">×</span><span>${song}</span></div>`,
                )
                .join("")}
              ${playlist.failedSongs.length > 5 ? `<div style="color: #9ca3af;">... and ${playlist.failedSongs.length - 5} more</div>` : ""}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * Attaches event listeners to dynamically created elements
   */
  private attachEventListeners(): void {
    const closeBtn = document.getElementById("syncify-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hide());
    }
  }
}

/**
 * Singleton instance of the sync widget for managing Syncify playlist synchronization UI
 */
export const syncWidget = new SyncWidget();
