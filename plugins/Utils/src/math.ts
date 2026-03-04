/**
 * Clamps a numeric value into the inclusive [min, max] range.
 * @param value Value to clamp.
 * @param min Minimum allowed value.
 * @param max Maximum allowed value.
 * @returns Clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
