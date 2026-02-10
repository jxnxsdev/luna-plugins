import { app, BrowserWindow, ipcMain, shell } from "electron";
import miniplayerHtml from "file://miniplayer.html?base64&minify";
import preloadCode from "file://miniplayerWindow.preload.js";
import { rm, writeFile } from "fs/promises";
import path from "path";

let win: BrowserWindow | null = null;
export const openMiniplayerWindow = async () => {
	if (win && !win.isDestroyed()) return win.focus();
    const preloadPath = path.join(app.getPath("temp"), `${Math.random().toString()}.preload.js`);
    try {
        await writeFile(preloadPath, preloadCode, "utf-8");
        win = new BrowserWindow({
            width: 700,
            height: 380,
            minWidth: 320,
            minHeight: 380,
            transparent: true,
            frame: false,
            resizable: true,
            alwaysOnTop: true,
			webPreferences: {
                preload: preloadPath,
			},
			autoHideMenuBar: true,
        });

        await win.loadURL(`data:text/html;base64,${miniplayerHtml}`);
    } catch (error) {
        console.error("Failed to create miniplayer window:", error);
        return null;
    }
}

export const closeWindow = async () => {
	if (win && !win.isDestroyed()) win.close();
};

export const sendIPC = (channel: string, data: any) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
    }
}

ipcMain.on("miniplayer.playercontrols", (event, data) => {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("miniplayer.playercontrolsFE", data);
        console.log("Sent player controls data to window:", window.id);
    }
});