export type SafeStorage = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem?: (key: string) => void;
};

/**
 * Safely resolves localStorage in environments where it may be unavailable.
 * @returns Storage adapter or null when unavailable.
 */
export function getSafeLocalStorage(): SafeStorage | null {
	try {
		if (typeof globalThis === "undefined") {
			return null;
		}

		const maybeStorage = (globalThis as { localStorage?: SafeStorage }).localStorage;
		if (!maybeStorage) {
			return null;
		}

		if (typeof maybeStorage.getItem !== "function" || typeof maybeStorage.setItem !== "function") {
			return null;
		}

		return maybeStorage;
	} catch {
		return null;
	}
}

/**
 * Reads JSON from storage and returns undefined when parsing fails.
 * @param storage Storage implementation.
 * @param key Item key.
 * @returns Parsed value or undefined.
 */
export function getJsonItem<T>(storage: SafeStorage, key: string): T | undefined {
	const raw = storage.getItem(key);
	if (!raw) {
		return undefined;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

/**
 * Writes JSON to storage.
 * @param storage Storage implementation.
 * @param key Item key.
 * @param value Value to serialize.
 */
export function setJsonItem(storage: SafeStorage, key: string, value: unknown): void {
	storage.setItem(key, JSON.stringify(value));
}

/**
 * Detects browser quota-exceeded errors.
 * @param error Unknown error value.
 * @returns True when the error indicates storage quota exhaustion.
 */
export function isQuotaExceededError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const maybeError = error as { name?: string; code?: number };
	return (
		maybeError.name === "QuotaExceededError" ||
		maybeError.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
		maybeError.code === 22 ||
		maybeError.code === 1014
	);
}
