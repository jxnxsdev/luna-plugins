import { LunaUnload, Tracer } from "@luna/core";
import { MediaItem, ContextMenu } from "@luna/lib";
import QRCode from "qrcode";

export const unloads = new Set<LunaUnload>();
export const { trace } = Tracer("[QRShare]");
const QRShareButton = ContextMenu.addButton(unloads);

ContextMenu.onMediaItem(unloads, async ({ mediaCollection, contextMenu }) => {
  let url = "";
  let image = "";
  let title = "";
  let artist = "";
  let type: "track" | "album" | "playlist" = "track";

  if ("tidalPlaylist" in mediaCollection && mediaCollection.tidalPlaylist) {
    url = mediaCollection.tidalPlaylist.url;
    image = `https://resources.tidal.com/images/${mediaCollection.tidalPlaylist.squareImage.replace(/-/g, "/")}/1080x1080.jpg`;
    title = mediaCollection.tidalPlaylist.title;
    type = "playlist";
  } else if ("tidalAlbum" in mediaCollection && mediaCollection.tidalAlbum) {
    url = `https://tidal.com/album/${mediaCollection.tidalAlbum.id}/u`;
    image = `https://resources.tidal.com/images/${mediaCollection.tidalAlbum.cover.replace(/-/g, "/")}/1280x1280.jpg`;
    title = mediaCollection.tidalAlbum.title;
    artist = mediaCollection.tidalAlbum.artists.map((a) => a.name).join(", ");
    type = "album";
  } else if (
    Array.isArray(mediaCollection.tMediaItems) &&
    mediaCollection.tMediaItems.length === 1
  ) {
    const mediaItemConverted = await MediaItem.fromId(
      mediaCollection.tMediaItems[0].item.id,
    );
    if (mediaItemConverted) {
      url = `https://tidal.com/track/${mediaItemConverted.id}/u`;
      image = (await mediaItemConverted.coverUrl()) || "";
      title = (await mediaItemConverted.title()) || "";
      artist = (await mediaItemConverted.artist())?.tidalArtist.name || "";
      type = "track";
    }
  }

  if (url) {
    QRShareButton.onClick(async () => {
      const result = await generateAndShowQRCodeOverlay(
        url,
        title,
        artist,
        image,
        type,
      );
      if (result) trace.log("QR code generated and shown.");
      else trace.warn("Failed to generate QR code overlay.");
    });

    QRShareButton.text = "Share via QR Code";
    QRShareButton.show(contextMenu);
  }
});

async function generateAndShowQRCodeOverlay(
  url: string,
  title: string,
  artist: string,
  imageUrl: string,
  type: "track" | "album" | "playlist",
) {
  try {
    const SIZE = 600;
    const QR_SIZE = 280;
    const CARD_PADDING = 24;

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, SIZE, SIZE);

    if (imageUrl) {
      try {
        const resp = await fetch(imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const objectURL = URL.createObjectURL(blob);
          const bgImg = new Image();
          bgImg.src = objectURL;

          await new Promise<void>((resolve) => {
            bgImg.onload = () => {
              const side = Math.min(bgImg.width, bgImg.height);
              ctx.globalAlpha = 0.35;
              ctx.drawImage(
                bgImg,
                (bgImg.width - side) / 2,
                (bgImg.height - side) / 2,
                side,
                side,
                0,
                0,
                SIZE,
                SIZE,
              );
              ctx.globalAlpha = 1;
              URL.revokeObjectURL(objectURL);
              resolve();
            };
            bgImg.onerror = () => {
              URL.revokeObjectURL(objectURL);
              resolve();
            };
          });
        }
      } catch (e) {
        console.warn("[QRShare] Failed to load album art:", e);
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, SIZE, SIZE);

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: QR_SIZE,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = () => reject("Failed to load QR code");
    });

    const cardSize = QR_SIZE + CARD_PADDING * 2;
    const cardX = (SIZE - cardSize) / 2;
    const cardY = 150;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(cardX, cardY, cardSize, cardSize);

    ctx.globalAlpha = 0.85;
    ctx.drawImage(
      qrImg,
      cardX + CARD_PADDING,
      cardY + CARD_PADDING,
      QR_SIZE,
      QR_SIZE,
    );
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = "bold 32px system-ui";

    const formattedText =
      type !== "playlist" && artist
        ? `Listen to "${title}" by ${artist} on TIDAL`
        : `Listen to "${title}" on TIDAL`;

    wrapText(ctx, formattedText, SIZE / 2, 80, SIZE - 40, 36);

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "999999";
    overlay.style.cursor = "default";

    const imgEl = document.createElement("img");
    imgEl.src = canvas.toDataURL("image/png");
    imgEl.style.maxWidth = "90%";
    imgEl.style.height = "auto";
    imgEl.style.borderRadius = "12px";
    imgEl.title = "Right click to copy image";

    overlay.appendChild(imgEl);

    const btnContainer = document.createElement("div");
    btnContainer.style.marginTop = "16px";
    btnContainer.style.display = "flex";
    btnContainer.style.gap = "16px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    Object.assign(saveBtn.style, {
      padding: "8px 16px",
      fontSize: "16px",
      cursor: "pointer",
      backgroundColor: "#1db954",
      color: "white",
      border: "none",
      borderRadius: "6px",
    });
    saveBtn.onmouseover = () => (saveBtn.style.opacity = "0.85");
    saveBtn.onmouseout = () => (saveBtn.style.opacity = "1");
    saveBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = imgEl.src;
      a.download = `${title}.png`;
      a.click();
    };

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    Object.assign(closeBtn.style, {
      padding: "8px 16px",
      fontSize: "16px",
      cursor: "pointer",
      backgroundColor: "#ff3b30",
      color: "white",
      border: "none",
      borderRadius: "6px",
    });
    closeBtn.onmouseover = () => (closeBtn.style.opacity = "0.85");
    closeBtn.onmouseout = () => (closeBtn.style.opacity = "1");
    closeBtn.onclick = () => overlay.remove();

    btnContainer.appendChild(saveBtn);
    btnContainer.appendChild(closeBtn);
    overlay.appendChild(btnContainer);

    document.body.appendChild(overlay);

    return true;
  } catch (err) {
    console.error("[QRShare] Failed to generate QR overlay:", err);
    return false;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
