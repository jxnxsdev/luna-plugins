import { retryWithBackoff } from "./async";

/**
 * Executes fetch with retry and non-2xx rejection handling.
 * @param url Request URL.
 * @param options Fetch options.
 * @param context Context label for retry errors.
 * @param retryOptions Retry strategy options.
 * @returns Successful response.
 */
export async function fetchWithRetry(
	url: string,
	options: RequestInit,
	context: string,
	retryOptions: {
		maxRetries?: number;
		baseDelayMs?: number;
		maxDelayMs?: number;
		onRetry?: (attempt: number, maxAttempts: number, error: Error, nextDelayMs: number) => void;
	} = {},
): Promise<Response> {
	return retryWithBackoff(async () => {
		const response = await fetch(url, options);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		return response;
	}, {
		...retryOptions,
		onRetry: retryOptions.onRetry,
	});
}
