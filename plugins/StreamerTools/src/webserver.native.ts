import express, { Request, Response } from "express";
import {
  EndpointAccessScope,
  getSharedHttpServerInfo,
  registerPluginHttpNamespace,
  stopSharedHttpServerIfIdle,
  emitSharedSocketIoEvent,
} from "@jxnxsdev/utils/native";

import serveWidgets from "./widgets.native";

const PLUGIN_NAME = "streamer-tools";
let basePath = `/${PLUGIN_NAME}`;
let unregisterNamespace: (() => Promise<void>) | null = null;

let serverPort: number = 2403;

/**
 * Starts the web server for the Streamer Tools plugin.
 * @param port The port on which to start the server.
 * @param accessScope The access scope for the endpoints.
 * @returns A promise resolving when the server is started.
 */
export async function startWebServer(
  port: number,
  accessScope: EndpointAccessScope = "local",
): Promise<void> {
  serverPort = port;
  const router = express.Router();
  router.use(express.json());

  const registration = await registerPluginHttpNamespace({
    pluginName: PLUGIN_NAME,
    ownerId: "streamer-tools",
    preferredPort: port,
    accessScope,
    router,
  });

  serveWidgets(router);

  basePath = registration.basePath;
  unregisterNamespace = registration.unregister;
  serverPort = registration.server.port;

  console.log(
    `Streamer Tools routes registered at ${registration.server.origin}${registration.basePath} (${accessScope})`,
  );
}

/**
 * Stops the web server for the Streamer Tools plugin.
 * @returns A promise resolving when the server is stopped.
 */
export async function stopWebServer(): Promise<void> {
  if (!unregisterNamespace) {
    return;
  }

  try {
    await unregisterNamespace();
    unregisterNamespace = null;
    await stopSharedHttpServerIfIdle();
    console.log("treamer Tools web routes have been unregistered");
  } catch (error) {
    console.error("Failed to stop Streamer Tools web routes:", error);
  }
}

/**
 * Gets the current web server information for the Streamer Tools plugin.
 * @returns An object containing the server port, host, origin, and base path, or null if the server is not running.
 */
export async function getWebServerInfo(): Promise<{
  port: number;
  host: string;
  origin: string;
  basePath: string;
} | null> {
  const serverInfo = getSharedHttpServerInfo();
  if (!serverInfo) {
    return null;
  }

  return {
    port: serverInfo.port,
    host: serverInfo.host,
    origin: serverInfo.origin,
    basePath,
  };
}

/**
 * Sends a message to all connected SocketIO clients for the Streamer Tools plugin.
 * @param event The event name to send.
 * @param data The data to send with the event.
 * @returns A promise resolving when the message is sent.
 */
export async function sendSocketMessage(
  event: string,
  data: any,
): Promise<void> {
  event = `${PLUGIN_NAME}.${event}`;
  await emitSharedSocketIoEvent(event, data);
}
