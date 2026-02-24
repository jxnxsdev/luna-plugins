import { app, BrowserWindow, ipcMain, shell } from "electron";
import miniplayerHtml from "file://miniplayer.html?base64&minify";
import preloadCode from "file://miniplayerWindow.preload.js";
import { rm, writeFile, readFile } from "fs/promises";
import path from "path";

let win: BrowserWindow | null = null;
let windowBounds = {
  x: undefined as number | undefined,
  y: undefined as number | undefined,
  width: 700,
  height: 380,
};
const boundsPath = path.join(app.getPath("userData"), "miniplayer-bounds.json");
async function loadWindowBounds() {
  try {
    const data = await readFile(boundsPath, "utf-8");
    windowBounds = JSON.parse(data);
  } catch (error) {
    // Use default bounds if file doesn't exist
  }
}

async function saveWindowBounds() {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    windowBounds = bounds;
    try {
      await writeFile(boundsPath, JSON.stringify(bounds), "utf-8");
    } catch (error) {
      console.error("Failed to save window bounds:", error);
    }
  }
}

export const openMiniplayerWindow = async () => {
  if (win && !win.isDestroyed()) return win.focus();

  await loadWindowBounds();

  const preloadPath = path.join(
    app.getPath("temp"),
    `${Math.random().toString()}.preload.js`,
  );
  try {
    await writeFile(preloadPath, preloadCode, "utf-8");
    win = new BrowserWindow({
      width: windowBounds.width,
      height: windowBounds.height,
      x: windowBounds.x,
      y: windowBounds.y,
      minWidth: 320,
      minHeight: 280,
      transparent: true,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath,
      },
      autoHideMenuBar: true,
    });

    win.on("close", () => {
      saveWindowBounds();
    });

    win.on("resize", () => {
      saveWindowBounds();
    });

    win.on("move", () => {
      saveWindowBounds();
    });

    await win.loadURL(`data:text/html;base64,${miniplayerHtml}`);
  } catch (error) {
    console.error("Failed to create miniplayer window:", error);
    return null;
  }
};

export const closeWindow = async () => {
  if (win && !win.isDestroyed()) win.close();
};

export const sendIPC = (channel: string, data: any) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
};

ipcMain.on("miniplayer.playercontrols", (event, data) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("miniplayer.playercontrolsFE", data);
    console.log("Sent player controls data to window:", window.id);
  }
});
