import React from "react";

import { ReactiveStore } from "@luna/core";
import { LunaNumberSetting, LunaSettings, LunaSwitchSetting } from "@luna/ui";

import {
  refreshTaskbarWidget,
  setTaskbarWidgetEnabled,
  setTaskbarWidgetHorizontalOffset,
  setTaskbarWidgetWidth,
} from "./index";

export const storage = ReactiveStore.getStore("Miniplayer");
export const settings = await ReactiveStore.getPluginStorage("Miniplayer", {
  addTaskbarWidget: true,
  taskbarWidgetHorizontalOffset: 220,
  taskbarWidgetWidth: 250,
  taskbarShowProgressBar: true,
  taskbarShowCover: true,
  taskbarShowSongName: true,
  taskbarShowArtistName: true,
  taskbarShowAlbumName: false,
  taskbarShowSongQuality: true,
  taskbarShowYear: false,
  taskbarShowTime: true,
  taskbarShowPlayState: true,
});

export const Settings = () => {
  const [addTaskbarWidget, setAddTaskbarWidget] = React.useState(
    settings.addTaskbarWidget,
  );
  const [horizontalOffset, setHorizontalOffset] = React.useState(
    settings.taskbarWidgetHorizontalOffset,
  );
  const [taskbarWidgetWidth, setTaskbarWidgetWidthState] = React.useState(
    settings.taskbarWidgetWidth,
  );
  const [showProgressBar, setShowProgressBar] = React.useState(
    settings.taskbarShowProgressBar,
  );
  const [showCover, setShowCover] = React.useState(settings.taskbarShowCover);
  const [showSongName, setShowSongName] = React.useState(
    settings.taskbarShowSongName,
  );
  const [showArtistName, setShowArtistName] = React.useState(
    settings.taskbarShowArtistName,
  );
  const [showAlbumName, setShowAlbumName] = React.useState(
    settings.taskbarShowAlbumName,
  );
  const [showSongQuality, setShowSongQuality] = React.useState(
    settings.taskbarShowSongQuality,
  );
  const [showYear, setShowYear] = React.useState(settings.taskbarShowYear);
  const [showTime, setShowTime] = React.useState(settings.taskbarShowTime);
  const [showPlayState, setShowPlayState] = React.useState(
    settings.taskbarShowPlayState,
  );

  return (
    <LunaSettings>
      <LunaSwitchSetting
        title="Add Widget to Taskbar (windows)"
        desc="Shows a compact transparent now-playing widget near the Windows taskbar while the plugin is loaded."
        checked={addTaskbarWidget}
        onChange={(_event: unknown, checked: boolean) => {
          setAddTaskbarWidget((settings.addTaskbarWidget = checked));
          void setTaskbarWidgetEnabled(checked);
        }}
      />
      <LunaNumberSetting
        title="Taskbar Widget Horizontal Position"
        desc="Horizontal offset in pixels from the left side of the taskbar area."
        value={horizontalOffset}
        min={0}
        max={4000}
        onNumber={(value: number) => {
          const safeValue = Math.max(0, Math.floor(value));
          setHorizontalOffset(
            (settings.taskbarWidgetHorizontalOffset = safeValue),
          );
          setTaskbarWidgetHorizontalOffset(safeValue);
          void refreshTaskbarWidget();
        }}
      />
      <LunaNumberSetting
        title="Taskbar Widget Width"
        desc="Adjust widget width in pixels. 250 is the minimum (current smallest size)."
        value={taskbarWidgetWidth}
        min={250}
        max={900}
        onNumber={(value: number) => {
          const safeValue = Math.max(250, Math.floor(value));
          setTaskbarWidgetWidthState((settings.taskbarWidgetWidth = safeValue));
          setTaskbarWidgetWidth(safeValue);
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Progress Bar"
        checked={showProgressBar}
        onChange={(_event: unknown, checked: boolean) => {
          setShowProgressBar((settings.taskbarShowProgressBar = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Cover"
        checked={showCover}
        onChange={(_event: unknown, checked: boolean) => {
          setShowCover((settings.taskbarShowCover = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Song Name"
        checked={showSongName}
        onChange={(_event: unknown, checked: boolean) => {
          setShowSongName((settings.taskbarShowSongName = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Artist Name"
        checked={showArtistName}
        onChange={(_event: unknown, checked: boolean) => {
          setShowArtistName((settings.taskbarShowArtistName = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Album Name"
        checked={showAlbumName}
        onChange={(_event: unknown, checked: boolean) => {
          setShowAlbumName((settings.taskbarShowAlbumName = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Song Quality"
        checked={showSongQuality}
        onChange={(_event: unknown, checked: boolean) => {
          setShowSongQuality((settings.taskbarShowSongQuality = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Release Year"
        checked={showYear}
        onChange={(_event: unknown, checked: boolean) => {
          setShowYear((settings.taskbarShowYear = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Time"
        desc="Display elapsed and remaining time around the progress bar."
        checked={showTime}
        onChange={(_event: unknown, checked: boolean) => {
          setShowTime((settings.taskbarShowTime = checked));
          void refreshTaskbarWidget();
        }}
      />
      <LunaSwitchSetting
        title="Show Play State"
        desc="Display a playing/paused marker in the taskbar widget."
        checked={showPlayState}
        onChange={(_event: unknown, checked: boolean) => {
          setShowPlayState((settings.taskbarShowPlayState = checked));
          void refreshTaskbarWidget();
        }}
      />
    </LunaSettings>
  );
};
