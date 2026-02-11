import React from "react";

import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaSwitchSetting, LunaNumberSetting } from "@luna/ui";
import { getRandomHelicopterGif } from "./helicopter";

export const storage = ReactiveStore.getStore("SpinnyCover");
export const settings = await ReactiveStore.getPluginStorage("SpinnyCover", { spinSpeed: 10, blurPercentage: 50, stopOnPause: false });

let lastSpeedNumber = settings.spinSpeed;

export const Settings = () => {
    const [spinSpeed, setSpinSpeed] = React.useState(settings.spinSpeed);
    const [blurPercentage, setBlurPercentage] = React.useState(settings.blurPercentage);
    const [stopOnPause, setStopOnPause] = React.useState(settings.stopOnPause);

    React.useEffect(() => {
        const invertedSpeed = 25000 - settings.spinSpeed * 25;
        document.documentElement.style.setProperty("--spinny-cover-speed", `${invertedSpeed}ms`);
        document.documentElement.style.setProperty("--spinny-cover-blur", `${blurPercentage / 5}px`);

    }, [spinSpeed, blurPercentage]);
    return (
        <LunaSettings>
            <LunaNumberSetting
                title="Spin Speed (1000 = no spin)"
                desc="Speed of the spinning cover image."
                tooltip="Spiiiiiiiiiiiiiiiiiiiiiiiiiiin"
                value={spinSpeed}
                min={1}
                max={1000}
                onNumber={(value: number) => {
                    setSpinSpeed((settings.spinSpeed = value));
                    const invertedSpeed = 25000 - settings.spinSpeed * 25;
                    document.documentElement.style.setProperty("--spinny-cover-speed", `${invertedSpeed}ms`);
                    if (lastSpeedNumber !== value && lastSpeedNumber < 960 && value >= 960) {
                        const audioPlayer = document.getElementById("spinnyCoverAudio") as HTMLAudioElement;
                        if (audioPlayer) {
                            audioPlayer.play().catch((error) => {
                                console.error("Error playing audio:", error);
                            });
                        }

                        const helicopterGif = document.getElementById("spinnyCoverHelicopter") as HTMLImageElement;
                        if (helicopterGif) {
                            helicopterGif.style.display = "block";
                            helicopterGif.src = getRandomHelicopterGif();
                            setTimeout(() => {
                                helicopterGif.style.display = "none";
                            }, 5000);
                        }
                    }
                    lastSpeedNumber = value;
                }}
            />
            <LunaNumberSetting
                title="Blur Percentage"
                desc="Percentage of blur applied to the cover image."
                tooltip="Blur it like you mean it"
                min={0}
                max={100}
                value={blurPercentage}
                onNumber={(value: number) => {
                    setBlurPercentage((settings.blurPercentage = value));
                    if (value < 0) setBlurPercentage((settings.blurPercentage = 0));
                    if (value > 100) setBlurPercentage((settings.blurPercentage = 100));
                    document.documentElement.style.setProperty("--spinny-cover-blur", `${value / 5}px`);
                    console.log(`Blur percentage set to ${value}%`);
                }}
            />
            <LunaSwitchSetting
                title="Stop on Pause"
                desc="Stop the spinning when playback is paused."
                tooltip="Pause the spin when music is paused"
                checked={stopOnPause}
                onChange={(_, checked: boolean) => {
                    setStopOnPause((settings.stopOnPause = checked));
                }}
            />
        </LunaSettings>
    );
};