import React from "react";

import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaTextSetting } from "@luna/ui";

import { start } from "./index";

export const storage = ReactiveStore.getStore("DiscordUtils");
export const settings = await ReactiveStore.getPluginStorage("DiscordUtils", { discordId: "" });

export const Settings = () => {
    const [discordId, setDiscordId] = React.useState(settings.discordId);
    return (
        <LunaSettings>
            <LunaTextSetting
                title="Discord ID"
                desc="The ID of your Discord Account. You can find it by enabling Developer Mode in Discord settings, then right-clicking your profile and selecting 'Copy ID'."
                tooltip="Your Discord User ID"
                value={discordId}
                onChange={(e: any) => {
                    setDiscordId((settings.discordId = e.target.value));
                    start();
                }}
            />
        </LunaSettings>
    );
};