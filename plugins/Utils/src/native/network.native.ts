import os from "os";

/**
 * Returns a priority rank for private/local IPv4 addresses.
 * Lower value means higher preference.
 * @param ip IPv4 address.
 * @returns Priority rank.
 */
export function getLocalIpPriority(ip: string): number {
	if (ip.startsWith("10.")) return 0;
	if (ip.startsWith("192.168.")) return 1;
	if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return 2;
	return 3;
}

/**
 * Picks the most suitable local IPv4 address from active network interfaces.
 * @returns Preferred local IPv4 or localhost fallback.
 */
export function getPreferredLocalIPv4(): string {
	const interfaces = os.networkInterfaces();
	const candidates: { ip: string; priority: number }[] = [];

	for (const name of Object.keys(interfaces)) {
		if (!(name.toLowerCase().includes("ethernet") || name.toLowerCase().includes("wireless"))) {
			continue;
		}
		const ifaceList = interfaces[name];
		if (!ifaceList) continue;
		for (const iface of ifaceList) {
			if (iface.family === "IPv4" && !iface.internal) {
				candidates.push({ ip: iface.address, priority: getLocalIpPriority(iface.address) });
			}
		}
	}

	if (candidates.length === 0) return "localhost";
	candidates.sort((a, b) => a.priority - b.priority);
	return candidates[0].ip;
}

/**
 * Builds an HTTP URL for local or LAN access scope.
 * @param options URL options.
 * @returns URL string.
 */
export function buildScopedHttpUrl(options: {
	port: number;
	basePath?: string;
	accessScope?: "local" | "network";
}): string {
	const scope = options.accessScope ?? "network";
	const host = scope === "local" ? "127.0.0.1" : getPreferredLocalIPv4();
	const normalizedBasePath = (options.basePath ?? "/").startsWith("/")
		? options.basePath ?? "/"
		: `/${options.basePath}`;
	return `http://${host}:${options.port}${normalizedBasePath}`;
}
