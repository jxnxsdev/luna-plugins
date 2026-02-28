import express from 'express';
import * as ws from './websocket.native';
import {
    buildScopedHttpUrl,
    downloadAndExtractZip,
    registerPluginHttpNamespace,
    stopSharedHttpServerIfIdle,
    type EndpointAccessScope,
} from '@jxnxsdev/utils/native';

const PLUGIN_NAME = 'tidalwave';
let unregisterNamespace: (() => Promise<void>) | null = null;
let basePath = `/${PLUGIN_NAME}`;
let serverPort = 80;

/**
 * Starts the HTTP and WebSocket server on the given port.
 * Downloads and serves the frontend automatically.
 * 
 * @param {number} port - The port on which the server should listen.
 * @returns {Promise<void>}
 */
export async function startServer(port: number): Promise<void> {
    await startServerWithScope(port, 'network');
}

export async function startServerWithScope(
    port: number,
    accessScope: EndpointAccessScope,
): Promise<void> {
    serverPort = port;
    const router = express.Router();

    await registerRoutes(router);
    await setupFrontend(router);

    const registration = await registerPluginHttpNamespace({
        pluginName: PLUGIN_NAME,
        ownerId: 'tidalwave',
        preferredPort: port,
        accessScope,
        router,
    });

    basePath = registration.basePath;
    unregisterNamespace = registration.unregister;
    serverPort = registration.server.port;
    await ws.startWebSocketServer();

    console.log(`TidalWave routes registered at ${registration.server.origin}${registration.basePath} (${accessScope})`);
}

/**
 * Registers API or middleware routes.
 */
async function registerRoutes(_router: express.Router): Promise<void> {

    // TODO: Register endpoints here
}

/**
 * Downloads and serves the latest frontend release.
 * Automatically extracts and serves from a local directory.
 */
async function setupFrontend(router: express.Router): Promise<void> {

    const downloadURL = 'https://github.com/jxnxsdev/TidalWave/releases/latest/download/TidalWave.zip';
    const downloadPath = 'tw_frontend.zip';
    const extractPath = 'tw_frontend';

    await downloadAndExtractZip({
        zipUrl: downloadURL,
        zipPath: downloadPath,
        destinationDirectory: extractPath,
        cleanupZip: true,
    });

    // Serve static frontend
    router.use('/', express.static(extractPath));
}

/**
 * Stops the HTTP and WebSocket server.
 * Cleans up the app and server instances.
 */
export async function stopServer(): Promise<void> {
    await ws.stopWebSocketServer();
    if (unregisterNamespace) {
        await unregisterNamespace();
        unregisterNamespace = null;
    }
    await stopSharedHttpServerIfIdle();
    console.log('TidalWave routes unregistered');
}

export async function getServerPort(): Promise<number> {
    return serverPort;
}

export async function getServerBasePath(): Promise<string> {
    return basePath;
}

export async function getShareUrl(
    accessScope: "local" | "network" = "network",
): Promise<string> {
    return buildScopedHttpUrl({
        port: serverPort,
        basePath,
        accessScope,
    });
}
