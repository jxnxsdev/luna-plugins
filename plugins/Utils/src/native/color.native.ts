/**
 * Downloads an image from a URL in electrons backend and returns it as a base64 encoded string.
 * @param url The URL of the image to download.
 * @returns A promise resolving to the base64-encoded image string.
 */
export async function downloadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image from ${url}: ${response.statusText}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString("base64");
  const contentType = response.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${base64Data}`;
}
