import http from "http";
import { WebSocket, WebSocketServer } from "ws";

export type WebSocketHub = {
	start: (server: http.Server) => Promise<void>;
	broadcast: (message: string) => void;
	stop: () => Promise<void>;
	clientCount: () => number;
};

/**
 * Creates a managed WebSocket server hub that tracks client connections.
 * @returns WebSocket hub instance.
 */
export function createWebSocketHub(): WebSocketHub {
	let serverRef: WebSocketServer | null = null;
	let clients = new Set<WebSocket>();

	return {
		start: async (server: http.Server) => {
			if (serverRef) {
				return;
			}

			serverRef = new WebSocketServer({ server });
			await new Promise<void>((resolve) => {
				serverRef?.on("connection", (client: WebSocket) => {
					clients.add(client);
					client.on("close", () => {
						clients.delete(client);
					});
				});
				serverRef?.on("listening", () => resolve());
			});
		},
		broadcast: (message: string) => {
			for (const client of clients) {
				if (client.readyState === WebSocket.OPEN) {
					client.send(message);
				}
			}
		},
		stop: async () => {
			if (!serverRef) {
				return;
			}

			await new Promise<void>((resolve) => {
				serverRef?.close(() => resolve());
			});
			clients = new Set();
			serverRef = null;
		},
		clientCount: () => clients.size,
	};
}
