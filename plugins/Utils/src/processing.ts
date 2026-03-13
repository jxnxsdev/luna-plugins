import { sleep } from "./async";

/**
 * Processes items in batches with an optional delay and progress callback.
 * @param items Items to process.
 * @param processor Item processor function.
 * @param options Batch execution options.
 * @returns Processed result list in original batch order.
 */
export async function batchProcess<T, R>(
	items: T[],
	processor: (item: T, index: number) => Promise<R>,
	options: {
		batchSize?: number;
		delayBetweenBatches?: number;
		onProgress?: (processed: number, total: number) => void;
	} = {},
): Promise<R[]> {
	const { batchSize = 10, delayBetweenBatches = 1000, onProgress } = options;
	const results: R[] = [];

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, Math.min(i + batchSize, items.length));
		const batchResults = await Promise.all(
			batch.map((item, batchIndex) => processor(item, i + batchIndex)),
		);

		results.push(...batchResults);
		onProgress?.(results.length, items.length);

		if (i + batchSize < items.length) {
			await sleep(delayBetweenBatches);
		}
	}

	return results;
}
