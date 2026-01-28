import React from "react";

import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaNumberSetting } from "@luna/ui";

import { updateIntervalTiming } from "./index";

export const storage = ReactiveStore.getStore("AudioVisualiser");
export const settings = await ReactiveStore.getPluginStorage("AudioVisualiser", { updateInterval: 20 });

export const Settings = () => {
    const [updateInterval, setUpdateInterval] = React.useState(settings.updateInterval);
    return (
        <LunaSettings>
            <LunaNumberSetting
                title="Update Interval (ms)"
                desc="How often the visualiser updates in milliseconds. Lower values result in smoother visuals but may use more CPU."
                tooltip="Visualiser update interval"
                value={updateInterval}
                min={5}
                max={1000}
                onNumber={(value: number) => {
                    setUpdateInterval((settings.updateInterval = value));
                    updateIntervalTiming();
                }}
            />
        </LunaSettings>
    );
};