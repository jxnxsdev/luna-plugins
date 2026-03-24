import { app, BrowserWindow, ipcMain, screen } from "electron";
import miniplayerHtml from "file://miniplayer.html?base64&minify";
import preloadCode from "file://miniplayerWindow.preload.js";
import taskbarWidgetHtml from "file://taskbarWidget.html?base64&minify";
import taskbarWidgetPreload from "file://taskbarWidget.preload.js";
import { writeFile, readFile } from "fs/promises";
import path from "path";

let win: BrowserWindow | null = null;
let taskbarWidgetWin: BrowserWindow | null = null;
let keepOnTopInterval: NodeJS.Timeout | null = null;
let hasFocusReassertListeners = false;
let windowBounds = {
  x: undefined as number | undefined,
  y: undefined as number | undefined,
  width: 700,
  height: 380,
};
const boundsPath = path.join(app.getPath("userData"), "miniplayer-bounds.json");

const MIN_TASKBAR_WIDGET_WIDTH = 250;
const MAX_TASKBAR_WIDGET_WIDTH = 900;
let taskbarWidgetWidth = MIN_TASKBAR_WIDGET_WIDTH;
const TASKBAR_WIDGET_HEIGHT = 42;

let taskbarWidgetOffsetX = 220;
const EDGE_PADDING = 8;
const TASKBAR_VERTICAL_OFFSET = 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function getTaskbarWidgetBounds() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const workArea = display.workArea;
  const taskbarHeight = bounds.height - workArea.height;
  const taskbarWidth = bounds.width - workArea.width;

  const isBottomTaskbar = taskbarHeight > 0 && workArea.y === bounds.y;
  const isTopTaskbar = taskbarHeight > 0 && workArea.y > bounds.y;
  const isLeftTaskbar = taskbarWidth > 0 && workArea.x > bounds.x;
  const isRightTaskbar = taskbarWidth > 0 && workArea.x === bounds.x;

  if (isBottomTaskbar) {
    const minX = workArea.x;
    const maxX = workArea.x + workArea.width - taskbarWidgetWidth;
    return {
      width: taskbarWidgetWidth,
      height: TASKBAR_WIDGET_HEIGHT,
      x: clamp(workArea.x + taskbarWidgetOffsetX, minX, maxX),
      y:
        workArea.y +
        workArea.height +
        Math.max(0, Math.floor((taskbarHeight - TASKBAR_WIDGET_HEIGHT) / 2)) +
        TASKBAR_VERTICAL_OFFSET,
    };
  }

  if (isTopTaskbar) {
    const minX = workArea.x;
    const maxX = workArea.x + workArea.width - taskbarWidgetWidth;
    return {
      width: taskbarWidgetWidth,
      height: TASKBAR_WIDGET_HEIGHT,
      x: clamp(workArea.x + taskbarWidgetOffsetX, minX, maxX),
      y:
        bounds.y +
        Math.max(0, Math.floor((taskbarHeight - TASKBAR_WIDGET_HEIGHT) / 2)),
    };
  }

  if (isLeftTaskbar) {
    return {
      width: taskbarWidgetWidth,
      height: TASKBAR_WIDGET_HEIGHT,
      x:
        bounds.x +
        Math.max(0, Math.floor((taskbarWidth - taskbarWidgetWidth) / 2)),
      y: workArea.y + EDGE_PADDING,
    };
  }

  if (isRightTaskbar) {
    return {
      width: taskbarWidgetWidth,
      height: TASKBAR_WIDGET_HEIGHT,
      x:
        workArea.x +
        workArea.width +
        Math.max(0, Math.floor((taskbarWidth - taskbarWidgetWidth) / 2)),
      y: workArea.y + EDGE_PADDING,
    };
  }

  return {
    width: taskbarWidgetWidth,
    height: TASKBAR_WIDGET_HEIGHT,
    x: clamp(
      workArea.x + taskbarWidgetOffsetX,
      workArea.x,
      workArea.x + workArea.width - taskbarWidgetWidth,
    ),
    y: workArea.y + workArea.height - TASKBAR_WIDGET_HEIGHT - EDGE_PADDING,
  };
}

export const setTaskbarWidgetHorizontalOffset = (offset: number) => {
  if (!Number.isFinite(offset)) return;
  taskbarWidgetOffsetX = Math.max(0, Math.floor(offset));
  updateTaskbarWidgetPosition();
};

export const setTaskbarWidgetWidth = (width: number) => {
  if (!Number.isFinite(width)) return;
  taskbarWidgetWidth = clamp(
    Math.floor(width),
    MIN_TASKBAR_WIDGET_WIDTH,
    MAX_TASKBAR_WIDGET_WIDTH,
  );
  updateTaskbarWidgetPosition();
};

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

const updateTaskbarWidgetPosition = () => {
  if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) return;
  taskbarWidgetWin.setBounds(getTaskbarWidgetBounds());
};

const ensureTaskbarWidgetOnTop = () => {
  if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) return;
  taskbarWidgetWin.setAlwaysOnTop(true, "screen-saver");
  if (!taskbarWidgetWin.isVisible()) {
    taskbarWidgetWin.showInactive();
  }
  taskbarWidgetWin.moveTop();
};

export const openTaskbarWidgetWindow = async () => {
  if (process.platform !== "win32") return;

  if (taskbarWidgetWin && !taskbarWidgetWin.isDestroyed()) {
    updateTaskbarWidgetPosition();
    taskbarWidgetWin.showInactive();
    return;
  }

  const preloadPath = path.join(
    app.getPath("temp"),
    `${Math.random().toString()}.taskbar.preload.js`,
  );

  try {
    await writeFile(preloadPath, taskbarWidgetPreload, "utf-8");

    taskbarWidgetWin = new BrowserWindow({
      ...getTaskbarWidgetBounds(),
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: preloadPath,
      },
      autoHideMenuBar: true,
    });

    taskbarWidgetWin.setAlwaysOnTop(true, "screen-saver");
    taskbarWidgetWin.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    ensureTaskbarWidgetOnTop();

    if (keepOnTopInterval) {
      clearInterval(keepOnTopInterval);
    }
    keepOnTopInterval = setInterval(ensureTaskbarWidgetOnTop, 200);

    taskbarWidgetWin.on("blur", ensureTaskbarWidgetOnTop);
    taskbarWidgetWin.on("show", ensureTaskbarWidgetOnTop);

    if (!hasFocusReassertListeners) {
      app.on("browser-window-focus", ensureTaskbarWidgetOnTop);
      app.on("browser-window-blur", ensureTaskbarWidgetOnTop);
      hasFocusReassertListeners = true;
    }

    taskbarWidgetWin.on("closed", () => {
      taskbarWidgetWin = null;
      screen.off("display-metrics-changed", updateTaskbarWidgetPosition);
      screen.off("display-added", updateTaskbarWidgetPosition);
      screen.off("display-removed", updateTaskbarWidgetPosition);
      if (keepOnTopInterval) {
        clearInterval(keepOnTopInterval);
        keepOnTopInterval = null;
      }
      if (hasFocusReassertListeners) {
        app.off("browser-window-focus", ensureTaskbarWidgetOnTop);
        app.off("browser-window-blur", ensureTaskbarWidgetOnTop);
        hasFocusReassertListeners = false;
      }
    });

    screen.on("display-metrics-changed", updateTaskbarWidgetPosition);
    screen.on("display-added", updateTaskbarWidgetPosition);
    screen.on("display-removed", updateTaskbarWidgetPosition);

    await taskbarWidgetWin.loadURL(
      `data:text/html;base64,${taskbarWidgetHtml}`,
    );
    taskbarWidgetWin.showInactive();
  } catch (error) {
    console.error("Failed to create taskbar widget window:", error);
    return null;
  }
};

export const closeWindow = async () => {
  if (win && !win.isDestroyed()) win.close();
};

export const closeTaskbarWidgetWindow = async () => {
  if (taskbarWidgetWin && !taskbarWidgetWin.isDestroyed()) {
    taskbarWidgetWin.close();
  }
  if (keepOnTopInterval) {
    clearInterval(keepOnTopInterval);
    keepOnTopInterval = null;
  }
  if (hasFocusReassertListeners) {
    app.off("browser-window-focus", ensureTaskbarWidgetOnTop);
    app.off("browser-window-blur", ensureTaskbarWidgetOnTop);
    hasFocusReassertListeners = false;
  }
};

export const sendIPC = (channel: string, data: any) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
};

export const sendTaskbarIPC = (channel: string, data: any) => {
  if (taskbarWidgetWin && !taskbarWidgetWin.isDestroyed()) {
    taskbarWidgetWin.webContents.send(channel, data);
  }
};

const isDataPopupWindow = (window: BrowserWindow) => {
  const url = window.webContents.getURL();
  return url.startsWith("data:text/html");
};

const getWindowArea = (window: BrowserWindow) => {
  const bounds = window.getBounds();
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
};

const getMainAppWindow = (): BrowserWindow | null => {
  const windows = BrowserWindow.getAllWindows().filter(
    (window) =>
      !window.isDestroyed() &&
      window !== taskbarWidgetWin &&
      window !== win,
  );
  if (windows.length === 0) return null;

  const byLargestArea = (a: BrowserWindow, b: BrowserWindow) =>
    getWindowArea(b) - getWindowArea(a);

  const preferred = windows
    .filter((window) => window.isVisible() && !isDataPopupWindow(window))
    .sort(byLargestArea);
  if (preferred.length > 0) return preferred[0];

  const visible = windows.filter((window) => window.isVisible()).sort(byLargestArea);
  if (visible.length > 0) return visible[0];

  return windows.sort(byLargestArea)[0] ?? null;
};

ipcMain.on("miniplayer.taskbar.focus-main", () => {
  const targetWindow = getMainAppWindow();
  if (!targetWindow) return;

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }

  targetWindow.show();
  targetWindow.moveTop();
  targetWindow.setAlwaysOnTop(true);
  targetWindow.setAlwaysOnTop(false);
  targetWindow.focus();
  app.focus({ steal: true });
});

ipcMain.on("miniplayer.playercontrols", (event, data) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("miniplayer.playercontrolsFE", data);
    console.log("Sent player controls data to window:", window.id);
  }
});
