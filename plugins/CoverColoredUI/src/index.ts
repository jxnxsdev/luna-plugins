import { LunaUnload, Tracer } from "@luna/core";
import { MediaItem } from "@luna/lib";
import ColorThief from "colorthief";

export const unloads = new Set<LunaUnload>();
export const { trace, errSignal } = Tracer("[CoverColoredUI]");

const colorThief = new ColorThief();
const img = new Image();

const colorStyle = document.createElement("style");
document.head.appendChild(colorStyle);

unloads.add(() => {
  colorStyle.remove();
});

function clampReadableColor(
  [r, g, b]: [number, number, number],
  minLuminance = 80,
): [number, number, number] {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance >= minLuminance) return [r, g, b];

  const factor = minLuminance / Math.max(luminance, 1);
  return [
    Math.min(255, Math.round(r * factor)),
    Math.min(255, Math.round(g * factor)),
    Math.min(255, Math.round(b * factor)),
  ];
}

let rafPending = false;
function scheduleColorUpdate(color: string) {
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    updateColors(color);
    rafPending = false;
  });
}

function updateColors(color: string) {
  colorStyle.textContent = `
    :root {
      --cover-ui-color: ${color};
    }

    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      color: var(--cover-ui-color) !important;
    }

    /* General text + divs + spans */
    p, span, a, li, label, strong, em, small,
    code, pre, blockquote, figcaption, div,
    th, td, caption,
    button, input, textarea, select, option {
      color: var(--cover-ui-color) !important;
    }

    /* SVG text */
    svg text, svg tspan {
      fill: var(--cover-ui-color) !important;
    }

    /* SVG icons using currentColor */
    svg {
      color: var(--cover-ui-color) !important;
    }

    svg * {
      fill: currentColor !important;
      stroke: currentColor !important;
    }
  `;
}

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
  const url = await mediaItem.coverUrl();
  if (!url) return;

  img.src = url;

  img.onload = () => {
    try {
      const dominantColor = colorThief.getColor(img) as [
        number,
        number,
        number,
      ];
      const safeColor = clampReadableColor(dominantColor);
      const rgbString = `rgb(${safeColor[0]}, ${safeColor[1]}, ${safeColor[2]})`;

      scheduleColorUpdate(rgbString);
    } catch (err) {
      trace.msg.err("Error updating colors:", err);
    }
  };
});
