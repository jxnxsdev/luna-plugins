import React from "react";

import { ReactiveStore } from "@luna/core";
import {
    LunaSettings,
    LunaSwitchSetting,
    LunaSecureTextSetting,
    LunaSelectSetting,
    LunaSelectItem,
    LunaTextSetting,
    LunaButtonSetting
} from "@luna/ui";

import { updateFont, getAvailableFonts, updateCustomFontUrl } from ".";
import { title } from "process";

export const storage = ReactiveStore.getStore("CustomFonts");
export const settings = await ReactiveStore.getPluginStorage("CustomFonts", {
    fontName: "",
    customFontName: "",
    customFontUrl: ""
});

export const Settings = () => {
    const [fontName, setFontName] = React.useState(settings.fontName);
    const [customFontName, setCustomFontName] = React.useState(settings.customFontName);
    const [fonts, setFonts] = React.useState<string[]>([]);
    const [customFontUrl, setCustomFontUrl] = React.useState(settings.customFontUrl);

    const titleDiv = document.querySelector("._title_a453dad");
    const savedDiv = `TIDA<b><span style="color: #32f4ff;">Luna</span></b>`;

    const refreshFonts = async () => {
        try {
            let availableFonts = await getAvailableFonts();
            setFonts(availableFonts);

            if (settings.fontName && !availableFonts.includes(settings.fontName)) {
                setFontName((settings.fontName = ""));
                await updateFont();
            }
        } catch (err) {
            console.error("Error fetching available fonts:", err);
        }
    };

    React.useEffect(() => {
        refreshFonts();
    }, []);

    return (
        <LunaSettings>
            <LunaSelectSetting
                title="Custom Font"
                value={fontName}
                onChange={async (e: any) => {
                    setFontName((settings.fontName = e.target.value));
                    if (e.target.value === "Comic Sans MS") {
                        titleDiv!.innerHTML += ` <span style="color:#1E90FF;font-family:'Comic Sans MS',cursive,sans-serif;font-size:1em;font-weight:bold;text-shadow:1px 1px 0 #FFD700,-1px -1px 0 #FF69B4;transform:rotate(-3deg) skew(-3deg);display:inline-block;padding:0.1em 0.3em;border:2px dashed #FF69B4;border-radius:8px;background:linear-gradient(45deg,#FFB6C1,#87CEFA);user-select:none;cursor:default;">Comic Sans Edition</span>`;
                    } else {
                        titleDiv!.innerHTML = savedDiv || "";
                    }
                    await updateFont().catch((err) => {
                        console.error("Error updating font:", err);
                    });
                }}
            >
                <LunaSelectItem value="" children="None" />
                {fonts.map((font) => (
                    <LunaSelectItem key={font} value={font} children={font} />
                ))}
            </LunaSelectSetting>
            <LunaTextSetting
                title="Custom Font File Location"
                desc="Enter the File Location of the custom font file (e.g., .woff, .ttf). Do not put it in quotes, etc.\nExample: C:\Users\User\Fonts\MyFont.ttf"
                value={settings.customFontUrl}
                onChange={async (e: any) => {
                    setCustomFontUrl((settings.customFontUrl = e.target.value));
                    await updateFont().catch((err) => {
                        console.error("Error updating font:", err);
                    });
                }}
            />
            <LunaTextSetting
                title="Custom Font Name"
                desc="Enter the EXACT name of the custom font as specified in the font file."
                value={settings.customFontName}
                onChange={async (e: any) => {
                    setCustomFontName((settings.customFontName = e.target.value));
                    await updateFont().catch((err) => {
                        console.error("Error updating font:", err);
                    });
                }}
            />
            <LunaButtonSetting
                title="Set Custom Font from File"
                desc="Fetch and apply the custom font from the provided file location."
                onClick={async () => {
                    setFontName((settings.fontName = settings.customFontName));
                    updateCustomFontUrl().catch((err) => {
                        console.error("Error updating custom font URL:", err);
                    });
                    await updateFont().catch((err) => {
                        console.error("Error updating font:", err);
                    });
                }}
            />
        </LunaSettings>
    );
};
