import {
    broadcastPluginWebSocket,
    startPluginWebSocketHub,
    stopPluginWebSocketHub,
} from '@jxnxsdev/utils/native';

const PLUGIN_NAME = 'tidalwave';

/**
 * Starts the WebSocket server on the given HTTP server instance.
 * Ensures connections are tracked and cleaned up when closed.
 *
 * @returns {Promise<void>}
 */
export async function startWebSocketServer(): Promise<void> {
    await startPluginWebSocketHub(PLUGIN_NAME);
}

/**
 * Sends a message to all connected WebSocket clients.
 *
 * @param {string} message - The message to broadcast.
 */
export async function broadcastToClients(message: string): Promise<void> {
    broadcastPluginWebSocket(PLUGIN_NAME, message);
}

export async function stopWebSocketServer(): Promise<void> {
    await stopPluginWebSocketHub(PLUGIN_NAME);
}
