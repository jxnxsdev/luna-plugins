import http from "http";

/**
 * Creates an HTTP server from an existing request listener.
 * @param requestListener Request listener function.
 * @returns HTTP server instance.
 */
export function createHttpServer(
	requestListener: http.RequestListener,
): http.Server {
	return http.createServer(requestListener);
}

/**
 * Starts listening on the given TCP port.
 * @param server HTTP server instance.
 * @param port Port to listen on.
 */
export async function listenHttpServer(
	server: http.Server,
	port: number,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.listen(port, () => resolve());
		server.once("error", reject);
	});
}

/**
 * Closes an HTTP server if it exists.
 * @param server HTTP server instance or null.
 */
export async function closeHttpServer(
	server: http.Server | null | undefined,
): Promise<void> {
	if (!server) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
