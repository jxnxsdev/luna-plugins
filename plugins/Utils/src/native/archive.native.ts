import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

/**
 * Removes a file or directory if it exists.
 * @param targetPath Path to remove.
 */
export async function removePathIfExists(targetPath: string): Promise<void> {
	if (!fs.existsSync(targetPath)) {
		return;
	}
	fs.rmSync(targetPath, { recursive: true, force: true });
}

/**
 * Downloads a URL to a local file.
 * @param url Source URL.
 * @param destinationPath Destination file path.
 */
export async function downloadToFile(
	url: string,
	destinationPath: string,
): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
	}

	const content = Buffer.from(await response.arrayBuffer());
	fs.writeFileSync(destinationPath, content);
}

/**
 * Extracts a ZIP archive to a target directory.
 * @param zipPath Path to ZIP file.
 * @param destinationDirectory Extraction directory.
 */
export async function extractZipFile(
	zipPath: string,
	destinationDirectory: string,
): Promise<void> {
	const zip = new AdmZip(zipPath);
	zip.extractAllTo(destinationDirectory, true);
}

/**
 * Downloads and extracts a ZIP file after cleaning destination paths.
 * @param options Download and extraction options.
 */
export async function downloadAndExtractZip(options: {
	zipUrl: string;
	zipPath: string;
	destinationDirectory: string;
	cleanupZip?: boolean;
}): Promise<void> {
	const zipPathAbsolute = path.resolve(options.zipPath);
	const destinationAbsolute = path.resolve(options.destinationDirectory);

	await removePathIfExists(destinationAbsolute);
	await removePathIfExists(zipPathAbsolute);
	await downloadToFile(options.zipUrl, zipPathAbsolute);
	await extractZipFile(zipPathAbsolute, destinationAbsolute);

	if (options.cleanupZip ?? true) {
		await removePathIfExists(zipPathAbsolute);
	}
}
