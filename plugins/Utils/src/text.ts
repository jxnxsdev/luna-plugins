/**
 * Sanitizes a search query by removing unsupported punctuation and normalizing whitespace.
 * @param query Raw query text.
 * @returns Sanitized query string.
 */
export function sanitizeSearchQuery(query: string): string {
	return query
		.replace(/[^\w\s'-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Formats a user-facing error string from a context label and unknown error.
 * @param context Context label for the failure.
 * @param error Error value.
 * @returns Formatted message.
 */
export function createUserErrorMessage(
	context: string,
	error: unknown,
): string {
	const errorMsg = error instanceof Error ? error.message : String(error);
	return `${context}: ${errorMsg}`;
}
