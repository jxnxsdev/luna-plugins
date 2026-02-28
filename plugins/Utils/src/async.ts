/**
 * Sleep for a specified duration.
 * @param ms Delay in milliseconds.
 * @returns Promise that resolves after the delay.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a promise factory with exponential backoff.
 * @param fn Async function to execute.
 * @param options Retry options.
 * @returns The successful result of fn.
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	options: {
		maxRetries?: number;
		baseDelayMs?: number;
		maxDelayMs?: number;
		onRetry?: (attempt: number, maxAttempts: number, error: Error, nextDelayMs: number) => void;
	} = {},
): Promise<T> {
	const maxRetries = options.maxRetries ?? 3;
	const baseDelayMs = options.baseDelayMs ?? 1000;
	const maxDelayMs = options.maxDelayMs ?? 5000;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt >= maxRetries) {
				break;
			}

			const nextDelayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
			options.onRetry?.(attempt + 1, maxRetries + 1, lastError, nextDelayMs);
			await sleep(nextDelayMs);
		}
	}

	throw new Error(lastError?.message ?? "retryWithBackoff failed");
}
