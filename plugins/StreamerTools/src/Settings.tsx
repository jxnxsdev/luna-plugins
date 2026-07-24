import * as React from "react";

import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaTextSetting, LunaSelectSetting, LunaSelectItem, LunaButtonSetting } from "@luna/ui";

export const storage = ReactiveStore.getStore("StreamerTools");
export const settings = await ReactiveStore.getPluginStorage("StreamerTools", { webServerPort: 2403, webServerAccessScope: "local" as "local" | "network" });

export const Settings = () => {
    const [webServerPort, setWebServerPort] = React.useState(settings.webServerPort);
    const [webServerAccessScope, setWebServerAccessScope] = React.useState(settings.webServerAccessScope);
    return (
        <LunaSettings>
            <LunaTextSetting
                title="Web Server Port"
                desc="The port on which the Streamer Tools web server will run. (Requires a reload of the plugin to take effect)"
                tooltip="The port on which the Streamer Tools web server will run."
                value={webServerPort}
                onChange={(value: string) => {
                    const portNumber = parseInt(value, 10);
                    if (!isNaN(portNumber) && portNumber > 0 && portNumber < 65536) {
                        setWebServerPort((settings.webServerPort = portNumber));
                    }
                }}
            />

            <LunaSelectSetting
                id="streamer-tools-web-server-access-scope"
                title="Endpoint Access"
                desc="Choose whether Streamer Tools web endpoints are reachable only from this computer or from any computer on the local network."
                value={webServerAccessScope}
                onChange={(event: any) => {
                    const value = event.target.value as "local" | "network";
                    setWebServerAccessScope((settings.webServerAccessScope = value));
                }}
            >
                <LunaSelectItem value="local">Local PC only</LunaSelectItem>
                <LunaSelectItem value="network">Whole network</LunaSelectItem>
            </LunaSelectSetting>

            <LunaButtonSetting
                title="Open Overlay Overview"
                desc="Opens the overlay overview page in your default browser."
                onClick={() => {
                    const url = `http://localhost:${settings.webServerPort}/streamer-tools/overview`;
                    window.open(url, "_blank");
                }}
            />
        </LunaSettings>
    );
};