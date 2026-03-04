import express, { type Request, type Response, type Router } from "express";
import http from "http";
import { createWebSocketHub, type WebSocketHub } from "./websocket.native";

export type EndpointAccessScope = "local" | "network";

export type SharedHttpServerInfo = {
	port: number;
	host: string;
	origin: string;
};

type RegisteredPlugin = {
	ownerId: string;
	router: Router;
	accessScope: EndpointAccessScope;
};

type SharedHttpState = {
	app: express.Express;
	server: http.Server;
	pluginsByName: Map<string, RegisteredPlugin>;
	webSocketHubByPlugin: Map<string, WebSocketHub>;
	port: number;
	host: string;
};

const DEFAULT_PORT = 2402;
const DEFAULT_HOST = "0.0.0.0";

function getStateContainer() {
	const root = globalThis as typeof globalThis & {
		__JXNXSDEV_SHARED_HTTP_SERVER__?: SharedHttpState;
	};
	return root;
}

function getClientIpAddress(req: Request): string {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string") {
		return forwarded.split(",")[0].trim();
	}
	return req.socket.remoteAddress ?? "";
}

function isLoopbackAddress(ip: string): boolean {
	if (!ip) {
		return false;
	}
	return (
		ip === "127.0.0.1" ||
		ip === "::1" ||
		ip === "::ffff:127.0.0.1" ||
		ip === "localhost"
	);
}

async function ensureState(preferredPort?: number): Promise<SharedHttpState> {
	const root = getStateContainer();
	if (root.__JXNXSDEV_SHARED_HTTP_SERVER__) {
		return root.__JXNXSDEV_SHARED_HTTP_SERVER__;
	}

	const app = express();
	const pluginsByName = new Map<string, RegisteredPlugin>();
	const webSocketHubByPlugin = new Map<string, WebSocketHub>();

	app.use(express.json());

	app.get("/", (_req, res) => {
		res.send("Shared plugin web server is running");
	});

	app.get("/_plugins", (_req, res) => {
		const plugins = Array.from(pluginsByName.entries())
			.map(([name, plugin]) => ({
				name,
				basePath: `/${name}`,
				ownerId: plugin.ownerId,
				accessScope: plugin.accessScope,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));

		res.json({
			server: {
				port,
				host: DEFAULT_HOST,
				origin: `http://127.0.0.1:${port}`,
			},
			plugins,
		});
	});

	app.use((req, res, next) => {
		const rawPath = req.path.startsWith("/") ? req.path.slice(1) : req.path;
		const [pluginName, ...restSegments] = rawPath.split("/");
		if (!pluginName) {
			return next();
		}

		const plugin = pluginsByName.get(pluginName);
		if (!plugin) {
			return next();
		}

		if (plugin.accessScope === "local") {
			const ipAddress = getClientIpAddress(req);
			if (!isLoopbackAddress(ipAddress)) {
				res.status(403).json({ error: "Endpoint is restricted to local machine access." });
				return;
			}
		}

		const originalUrl = req.url;
		const suffixPath = restSegments.join("/");
		const suffixQuery = originalUrl.includes("?")
			? originalUrl.slice(originalUrl.indexOf("?"))
			: "";
		req.url = `/${suffixPath}${suffixQuery}`;

		plugin.router(req, res, (error?: unknown) => {
			req.url = originalUrl;
			if (error) {
				next(error);
				return;
			}
			next();
		});
	});

	const server = http.createServer(app);
	const port = preferredPort ?? DEFAULT_PORT;

	await new Promise<void>((resolve, reject) => {
		server.listen(port, DEFAULT_HOST, () => resolve());
		server.once("error", reject);
	});

	const state: SharedHttpState = {
		app,
		server,
		pluginsByName,
		webSocketHubByPlugin,
		port,
		host: DEFAULT_HOST,
	};

	root.__JXNXSDEV_SHARED_HTTP_SERVER__ = state;
	return state;
}

/**
 * Registers a plugin router under a unique namespace path: /pluginName/*
 * and ensures only one owner can claim a plugin name at a time.
 * @param options Registration options.
 * @returns Registration details and unregister callback.
 */
export async function registerPluginHttpNamespace(options: {
	pluginName: string;
	router: Router;
	ownerId?: string;
	preferredPort?: number;
	accessScope?: EndpointAccessScope;
}): Promise<{
	pluginName: string;
	basePath: string;
	server: SharedHttpServerInfo;
	unregister: () => Promise<void>;
}> {
	const pluginName = options.pluginName.trim().toLowerCase();
	if (!/^[a-z0-9-]+$/.test(pluginName)) {
		throw new Error(
			`Invalid plugin name '${options.pluginName}'. Use lowercase letters, numbers, and hyphens only.`,
		);
	}

	const ownerId = options.ownerId ?? pluginName;
	const accessScope = options.accessScope ?? "local";
	const state = await ensureState(options.preferredPort);

	if (state.port !== (options.preferredPort ?? state.port)) {
		console.warn(
			`[SharedHttpServer] Requested port ${options.preferredPort} ignored; shared server already running on ${state.port}.`,
		);
	}

	const existing = state.pluginsByName.get(pluginName);
	if (existing && existing.ownerId !== ownerId) {
		throw new Error(
			`Plugin namespace '/${pluginName}' is already registered by another plugin owner.`,
		);
	}

	state.pluginsByName.set(pluginName, {
		ownerId,
		router: options.router,
		accessScope,
	});

	return {
		pluginName,
		basePath: `/${pluginName}`,
		server: {
			port: state.port,
			host: state.host,
			origin: `http://127.0.0.1:${state.port}`,
		},
		unregister: async () => {
			const current = state.pluginsByName.get(pluginName);
			if (current?.ownerId === ownerId) {
				const websocketHub = state.webSocketHubByPlugin.get(pluginName);
				if (websocketHub) {
					await websocketHub.stop();
					state.webSocketHubByPlugin.delete(pluginName);
				}
				state.pluginsByName.delete(pluginName);
			}
		},
	};
}

/**
 * Starts (or reuses) a plugin-scoped WebSocket hub attached to the shared HTTP server.
 * @param pluginName Registered plugin namespace.
 */
export async function startPluginWebSocketHub(pluginName: string): Promise<void> {
	const normalizedName = pluginName.trim().toLowerCase();
	const state = getStateContainer().__JXNXSDEV_SHARED_HTTP_SERVER__;
	if (!state) {
		throw new Error("Shared HTTP server is not running.");
	}
	if (!state.pluginsByName.has(normalizedName)) {
		throw new Error(
			`Plugin namespace '/${normalizedName}' is not registered on the shared HTTP server.`,
		);
	}

	const existing = state.webSocketHubByPlugin.get(normalizedName);
	if (existing) {
		await existing.start(state.server);
		return;
	}

	const hub = createWebSocketHub();
	await hub.start(state.server);
	state.webSocketHubByPlugin.set(normalizedName, hub);
}

/**
 * Broadcasts a message to all WebSocket clients in a plugin-scoped hub.
 * @param pluginName Registered plugin namespace.
 * @param message Message payload.
 */
export function broadcastPluginWebSocket(
	pluginName: string,
	message: string,
): void {
	const normalizedName = pluginName.trim().toLowerCase();
	const state = getStateContainer().__JXNXSDEV_SHARED_HTTP_SERVER__;
	if (!state) {
		return;
	}

	state.webSocketHubByPlugin.get(normalizedName)?.broadcast(message);
}

/**
 * Stops and removes a plugin-scoped WebSocket hub.
 * @param pluginName Registered plugin namespace.
 */
export async function stopPluginWebSocketHub(pluginName: string): Promise<void> {
	const normalizedName = pluginName.trim().toLowerCase();
	const state = getStateContainer().__JXNXSDEV_SHARED_HTTP_SERVER__;
	if (!state) {
		return;
	}

	const hub = state.webSocketHubByPlugin.get(normalizedName);
	if (!hub) {
		return;
	}

	await hub.stop();
	state.webSocketHubByPlugin.delete(normalizedName);
}

/**
 * Returns shared HTTP server details when running.
 * @returns Running server details or undefined.
 */
export function getSharedHttpServerInfo(): SharedHttpServerInfo | undefined {
	const state = getStateContainer().__JXNXSDEV_SHARED_HTTP_SERVER__;
	if (!state) {
		return undefined;
	}
	return {
		port: state.port,
		host: state.host,
		origin: `http://127.0.0.1:${state.port}`,
	};
}

/**
 * Stops the shared HTTP server only when no plugin namespaces are registered.
 */
export async function stopSharedHttpServerIfIdle(): Promise<void> {
	const root = getStateContainer();
	const state = root.__JXNXSDEV_SHARED_HTTP_SERVER__;
	if (!state) {
		return;
	}
	if (state.pluginsByName.size > 0) {
		return;
	}

	for (const [pluginName, hub] of state.webSocketHubByPlugin.entries()) {
		await hub.stop();
		state.webSocketHubByPlugin.delete(pluginName);
	}

	await new Promise<void>((resolve, reject) => {
		state.server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

	root.__JXNXSDEV_SHARED_HTTP_SERVER__ = undefined;
}
