import React from "react";

import { ReactiveStore } from "@luna/core";
import {
    LunaSettings,
    LunaNumberSetting,
    LunaSelectSetting,
    LunaSelectItem,
    LunaSwitchSetting,
    LunaTextSetting,
    LunaButtonSetting
} from "@luna/ui";

import { updateIntervalTiming, applyVisualiserSettings } from "./index";

const DEFAULT_SETTINGS = {
    updateInterval: 20,
    barCount: 38,
    colorMode: "static" as "static" | "albumArt",
    staticColor: "#33ffee",
    gradientEndColor: "rgba(255,255,255,0.2)",
    barStyle: "rounded" as "rounded" | "sharp" | "capsule" | "glow" | "gradient" | "segmented" | "outline",
    growFromTop: false,
    slopeTowardCenter: false,
    slopeAggression: 52,
    visualiserOpacity: 30,
    barGap: 2,
    smoothing: 25,
    sensitivity: 120,
    peakDecay: 98,
    minHeight: 0,
    maxHeight: 100,
    glowStrength: 12,
    mirrorMode: false,
    hideWhenPaused: true,
    selectedPreset: "custom"
};

export const storage = ReactiveStore.getStore("AudioVisualiser");
export const settings = await ReactiveStore.getPluginStorage("AudioVisualiser", { ...DEFAULT_SETTINGS });

type PresetValues = Partial<typeof settings>;

const PRESETS: { name: string; values: PresetValues }[] = [
    {
        name: "Neon",
        values: {
            colorMode: "static",
            staticColor: "#33ffee",
            gradientEndColor: "rgba(255,255,255,0.35)",
            barStyle: "glow",
            barCount: 38,
            barGap: 2,
            smoothing: 25,
            sensitivity: 130,
            glowStrength: 18,
            slopeTowardCenter: true,
            slopeAggression: 35,
            mirrorMode: true,
            visualiserOpacity: 35,
            minHeight: 1,
            maxHeight: 100,
            peakDecay: 98,
            growFromTop: false,
            hideWhenPaused: true
        }
    },
    {
        name: "Glass",
        values: {
            colorMode: "albumArt",
            barStyle: "gradient",
            gradientEndColor: "rgba(255,255,255,0.15)",
            barCount: 48,
            barGap: 1,
            smoothing: 35,
            sensitivity: 115,
            slopeTowardCenter: false,
            mirrorMode: false,
            visualiserOpacity: 28,
            minHeight: 0,
            maxHeight: 92,
            peakDecay: 99,
            growFromTop: false,
            hideWhenPaused: true
        }
    },
    {
        name: "Minimal",
        values: {
            colorMode: "static",
            staticColor: "#ffffff",
            barStyle: "sharp",
            barCount: 20,
            barGap: 4,
            smoothing: 30,
            sensitivity: 100,
            slopeTowardCenter: false,
            mirrorMode: false,
            visualiserOpacity: 22,
            minHeight: 0,
            maxHeight: 88,
            peakDecay: 98,
            growFromTop: false,
            glowStrength: 0,
            hideWhenPaused: true
        }
    },
    {
        name: "EDM",
        values: {
            colorMode: "albumArt",
            barStyle: "segmented",
            barCount: 56,
            barGap: 1,
            smoothing: 14,
            sensitivity: 170,
            slopeTowardCenter: true,
            slopeAggression: 45,
            mirrorMode: true,
            visualiserOpacity: 40,
            minHeight: 2,
            maxHeight: 100,
            peakDecay: 96,
            growFromTop: false,
            hideWhenPaused: false
        }
    },
    {
        name: "Broadcast",
        values: {
            colorMode: "static",
            staticColor: "#7cf7ff",
            barStyle: "outline",
            barCount: 30,
            barGap: 3,
            smoothing: 22,
            sensitivity: 120,
            slopeTowardCenter: false,
            mirrorMode: false,
            visualiserOpacity: 32,
            minHeight: 3,
            maxHeight: 100,
            peakDecay: 97,
            growFromTop: true,
            hideWhenPaused: true
        }
    },
    {
        name: "Capsule",
        values: {
            colorMode: "albumArt",
            barStyle: "capsule",
            barCount: 34,
            barGap: 2,
            smoothing: 28,
            sensitivity: 125,
            slopeTowardCenter: true,
            slopeAggression: 25,
            mirrorMode: false,
            visualiserOpacity: 30,
            minHeight: 1,
            maxHeight: 95,
            peakDecay: 98,
            growFromTop: false,
            hideWhenPaused: true
        }
    },
    {
        name: "Mirror Pulse",
        values: {
            colorMode: "static",
            staticColor: "#ff4d9b",
            barStyle: "rounded",
            barCount: 42,
            barGap: 2,
            smoothing: 18,
            sensitivity: 150,
            slopeTowardCenter: true,
            slopeAggression: 55,
            mirrorMode: true,
            visualiserOpacity: 36,
            minHeight: 1,
            maxHeight: 100,
            peakDecay: 97,
            growFromTop: false,
            hideWhenPaused: false
        }
    },
    {
        name: "Soft Wave",
        values: {
            colorMode: "albumArt",
            barStyle: "gradient",
            gradientEndColor: "rgba(255,255,255,0.5)",
            barCount: 26,
            barGap: 3,
            smoothing: 45,
            sensitivity: 90,
            slopeTowardCenter: true,
            slopeAggression: 20,
            mirrorMode: true,
            visualiserOpacity: 24,
            minHeight: 4,
            maxHeight: 82,
            peakDecay: 99,
            growFromTop: false,
            hideWhenPaused: true
        }
    },
    {
        name: "Retro",
        values: {
            colorMode: "static",
            staticColor: "#7dff5f",
            barStyle: "segmented",
            barCount: 32,
            barGap: 2,
            smoothing: 20,
            sensitivity: 135,
            slopeTowardCenter: false,
            mirrorMode: false,
            visualiserOpacity: 35,
            minHeight: 2,
            maxHeight: 100,
            peakDecay: 96,
            growFromTop: false,
            hideWhenPaused: true
        }
    },
    {
        name: "Top Drop",
        values: {
            colorMode: "albumArt",
            barStyle: "outline",
            barCount: 36,
            barGap: 2,
            smoothing: 16,
            sensitivity: 145,
            slopeTowardCenter: true,
            slopeAggression: 30,
            mirrorMode: true,
            visualiserOpacity: 33,
            minHeight: 0,
            maxHeight: 100,
            peakDecay: 97,
            growFromTop: true,
            hideWhenPaused: false
        }
    }
];

export const Settings = () => {
    const [updateInterval, setUpdateInterval] = React.useState(settings.updateInterval);
    const [barCount, setBarCount] = React.useState(settings.barCount);
    const [colorMode, setColorMode] = React.useState(settings.colorMode);
    const [staticColor, setStaticColor] = React.useState(settings.staticColor);
    const [gradientEndColor, setGradientEndColor] = React.useState(settings.gradientEndColor);
    const [barStyle, setBarStyle] = React.useState(settings.barStyle);
    const [growFromTop, setGrowFromTop] = React.useState(settings.growFromTop);
    const [slopeTowardCenter, setSlopeTowardCenter] = React.useState(settings.slopeTowardCenter);
    const [slopeAggression, setSlopeAggression] = React.useState(settings.slopeAggression);
    const [visualiserOpacity, setVisualiserOpacity] = React.useState(settings.visualiserOpacity);
    const [barGap, setBarGap] = React.useState(settings.barGap);
    const [smoothing, setSmoothing] = React.useState(settings.smoothing);
    const [sensitivity, setSensitivity] = React.useState(settings.sensitivity);
    const [peakDecay, setPeakDecay] = React.useState(settings.peakDecay);
    const [minHeight, setMinHeight] = React.useState(settings.minHeight);
    const [maxHeight, setMaxHeight] = React.useState(settings.maxHeight);
    const [glowStrength, setGlowStrength] = React.useState(settings.glowStrength);
    const [mirrorMode, setMirrorMode] = React.useState(settings.mirrorMode);
    const [hideWhenPaused, setHideWhenPaused] = React.useState(settings.hideWhenPaused);
    const [selectedPreset, setSelectedPreset] = React.useState(settings.selectedPreset || "custom");

    const syncStateFromSettings = () => {
        setUpdateInterval(settings.updateInterval);
        setBarCount(settings.barCount);
        setColorMode(settings.colorMode);
        setStaticColor(settings.staticColor);
        setGradientEndColor(settings.gradientEndColor);
        setBarStyle(settings.barStyle);
        setGrowFromTop(settings.growFromTop);
        setSlopeTowardCenter(settings.slopeTowardCenter);
        setSlopeAggression(settings.slopeAggression);
        setVisualiserOpacity(settings.visualiserOpacity);
        setBarGap(settings.barGap);
        setSmoothing(settings.smoothing);
        setSensitivity(settings.sensitivity);
        setPeakDecay(settings.peakDecay);
        setMinHeight(settings.minHeight);
        setMaxHeight(settings.maxHeight);
        setGlowStrength(settings.glowStrength);
        setMirrorMode(settings.mirrorMode);
        setHideWhenPaused(settings.hideWhenPaused);
        setSelectedPreset(settings.selectedPreset || "custom");
    };

    const markAsCustom = () => {
        if (settings.selectedPreset !== "custom") {
            settings.selectedPreset = "custom";
            setSelectedPreset("custom");
        }
    };

    const applyPreset = (presetName: string, values: PresetValues) => {
        const updateIntervalWasChanged = values.updateInterval !== undefined && values.updateInterval !== settings.updateInterval;
        Object.assign(settings, values);
        settings.selectedPreset = presetName;
        setSelectedPreset(presetName);
        if (updateIntervalWasChanged) {
            updateIntervalTiming();
        }
        applyVisualiserSettings();
        syncStateFromSettings();
    };

    const resetDefaults = () => {
        const updateIntervalWasChanged = settings.updateInterval !== DEFAULT_SETTINGS.updateInterval;
        Object.assign(settings, { ...DEFAULT_SETTINGS });
        if (updateIntervalWasChanged) {
            updateIntervalTiming();
        }
        applyVisualiserSettings();
        syncStateFromSettings();
    };

    React.useEffect(() => {
        applyVisualiserSettings();
    }, []);

    const sectionTitleStyle: React.CSSProperties = {
        marginTop: "18px",
        marginBottom: "8px",
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.02em",
        opacity: 0.85
    };

    const sectionHintStyle: React.CSSProperties = {
        marginTop: "0",
        marginBottom: "10px",
        fontSize: "12px",
        lineHeight: 1.4,
        opacity: 0.7
    };

    return (
        <LunaSettings>
            <div style={sectionTitleStyle}>Presets</div>
            <p style={sectionHintStyle}>
                Start with a preset, then tweak controls below. Any manual edit switches back to Custom.
            </p>
            <LunaSelectSetting
                id="visualiser-presets"
                title="Visual Style Preset"
                desc="Applies a full tuning profile for visuals and motion."
                value={selectedPreset}
                onChange={(event: any) => {
                    const presetName = event.target.value as string;
                    if (presetName === "custom") {
                        settings.selectedPreset = "custom";
                        setSelectedPreset("custom");
                        return;
                    }

                    const preset = PRESETS.find((entry) => entry.name === presetName);
                    if (!preset) return;
                    applyPreset(preset.name, preset.values);
                }}
            >
                <LunaSelectItem value="custom" children="Custom" />
                {PRESETS.map((preset) => (
                    <LunaSelectItem key={preset.name} value={preset.name} children={preset.name} />
                ))}
            </LunaSelectSetting>

            <div style={sectionTitleStyle}>Performance and Motion</div>
            <p style={sectionHintStyle}>
                Lower interval reacts faster, higher smoothing feels calmer. Keep bar count moderate for best performance.
            </p>
            <LunaNumberSetting
                title="Analyser Update Interval (ms)"
                desc="How often audio magnitudes are sampled. Lower values react faster but can use more CPU."
                tooltip="Visualiser update interval"
                value={updateInterval}
                min={5}
                max={1000}
                onNumber={(value: number) => {
                    setUpdateInterval((settings.updateInterval = value));
                    markAsCustom();
                    updateIntervalTiming();
                }}
            />
            <LunaNumberSetting
                title="Smoothing"
                desc="How quickly bars move toward new values. Higher is smoother and slower."
                value={smoothing}
                min={1}
                max={100}
                onNumber={(value: number) => {
                    setSmoothing((settings.smoothing = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Sensitivity (%)"
                desc="Scales analyser intensity before animation. Higher values create taller bars."
                value={sensitivity}
                min={20}
                max={400}
                onNumber={(value: number) => {
                    setSensitivity((settings.sensitivity = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Peak Decay (%)"
                desc="How quickly normalization falls after loud sections. Lower reacts faster, higher is steadier."
                value={peakDecay}
                min={90}
                max={100}
                onNumber={(value: number) => {
                    setPeakDecay((settings.peakDecay = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaSwitchSetting
                title="Hide When Paused"
                desc="Fade out the visualiser when playback is paused."
                checked={hideWhenPaused}
                onChange={(_event: any, checked: boolean) => {
                    setHideWhenPaused((settings.hideWhenPaused = checked));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />

            <div style={sectionTitleStyle}>Layout and Shape</div>
            <LunaNumberSetting
                title="Bar Count"
                desc="How many bars to render. Higher values cost more GPU/CPU."
                value={barCount}
                min={2}
                max={128}
                onNumber={(value: number) => {
                    setBarCount((settings.barCount = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Bar Gap (px)"
                desc="Spacing between bars in pixels."
                value={barGap}
                min={0}
                max={20}
                onNumber={(value: number) => {
                    setBarGap((settings.barGap = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Minimum Height (%)"
                desc="Smallest bar height after normalization."
                value={minHeight}
                min={0}
                max={40}
                onNumber={(value: number) => {
                    setMinHeight((settings.minHeight = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Maximum Height (%)"
                desc="Maximum bar height to cap spikes."
                value={maxHeight}
                min={20}
                max={100}
                onNumber={(value: number) => {
                    setMaxHeight((settings.maxHeight = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaSwitchSetting
                title="Mirror Mode"
                desc="Mirrors left/right bar magnitudes around the center."
                checked={mirrorMode}
                onChange={(_event: any, checked: boolean) => {
                    setMirrorMode((settings.mirrorMode = checked));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaSwitchSetting
                title="Grow From Top"
                desc="Bars grow downward from the top edge instead of upward from the bottom."
                checked={growFromTop}
                onChange={(_event: any, checked: boolean) => {
                    setGrowFromTop((settings.growFromTop = checked));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaSwitchSetting
                title="Slope Toward Center"
                desc="Reduces edge bar heights so the center appears more prominent."
                checked={slopeTowardCenter}
                onChange={(_event: any, checked: boolean) => {
                    setSlopeTowardCenter((settings.slopeTowardCenter = checked));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Slope Aggression"
                desc="Strength of center slope when enabled."
                value={slopeAggression}
                min={0}
                max={100}
                onNumber={(value: number) => {
                    setSlopeAggression((settings.slopeAggression = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />

            <div style={sectionTitleStyle}>Color and Style</div>
            <LunaSelectSetting
                title="Color Mode"
                desc="Use a fixed color or follow dominant album art color."
                value={colorMode}
                onChange={(event: any) => {
                    setColorMode((settings.colorMode = event.target.value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            >
                <LunaSelectItem value="static" children="Static Color" />
                <LunaSelectItem value="albumArt" children="Follow Album Art" />
            </LunaSelectSetting>
            <LunaTextSetting
                title="Static Color"
                desc="Color used when Color Mode is Static. Example: #33ffee"
                value={staticColor}
                onChange={(event: any) => {
                    setStaticColor((settings.staticColor = event.target.value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaTextSetting
                title="Gradient End Color"
                desc="Second stop used by Gradient bar style."
                value={gradientEndColor}
                onChange={(event: any) => {
                    setGradientEndColor((settings.gradientEndColor = event.target.value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaSelectSetting
                title="Bar Style"
                desc="Shape and appearance of bars."
                value={barStyle}
                onChange={(event: any) => {
                    setBarStyle((settings.barStyle = event.target.value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            >
                <LunaSelectItem value="rounded" children="Rounded" />
                <LunaSelectItem value="sharp" children="Sharp" />
                <LunaSelectItem value="capsule" children="Capsule" />
                <LunaSelectItem value="glow" children="Glow" />
                <LunaSelectItem value="gradient" children="Gradient" />
                <LunaSelectItem value="segmented" children="Segmented" />
                <LunaSelectItem value="outline" children="Outline" />
            </LunaSelectSetting>
            <LunaNumberSetting
                title="Glow Strength (px)"
                desc="Glow radius used by Glow style."
                value={glowStrength}
                min={0}
                max={40}
                onNumber={(value: number) => {
                    setGlowStrength((settings.glowStrength = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaNumberSetting
                title="Visualiser Opacity"
                desc="Overall visualiser opacity in percent."
                value={visualiserOpacity}
                min={0}
                max={100}
                onNumber={(value: number) => {
                    setVisualiserOpacity((settings.visualiserOpacity = value));
                    markAsCustom();
                    applyVisualiserSettings();
                }}
            />
            <LunaButtonSetting
                title="Reset to Default"
                desc="Restore all visualiser settings to default values."
                onClick={() => {
                    resetDefaults();
                }}
            />
        </LunaSettings>
    );
};