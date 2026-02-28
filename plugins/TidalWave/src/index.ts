import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import * as lib from "@luna/lib";
import * as core from "@luna/core";
import * as webServer from "./native/webserver.native";

export { Settings } from "./Settings";
import { settings } from "./Settings";

export const unloads = new Set<LunaUnload>();
unloads.add(() => {
    webServer.stopServer();
});

webServer
    .startServerWithScope(settings.webPort, settings.serverAccessScope)
    .catch((error) => {
        console.error("Failed to start TidalWave web routes:", error);
    });

export async function search(query: string) {
    // use tidals search
    
}