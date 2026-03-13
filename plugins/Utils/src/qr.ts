import QRCode from "qrcode";

/**
 * Generates a QR code image data URL for a target URL.
 * @param url Target URL to encode.
 * @param options QR rendering options.
 * @returns Data URL for a PNG QR image.
 */
export async function generateQrCodeDataUrl(
	url: string,
	options: {
		width?: number;
		margin?: number;
		errorCorrectionLevel?: "L" | "M" | "Q" | "H";
		darkColor?: string;
		lightColor?: string;
	} = {},
): Promise<string> {
	return QRCode.toDataURL(url, {
		width: options.width,
		margin: options.margin ?? 1,
		errorCorrectionLevel: options.errorCorrectionLevel ?? "H",
		color: {
			dark: options.darkColor ?? "#000000",
			light: options.lightColor ?? "#FFFFFF",
		},
	});
}
