import { LunaUnload, Tracer } from "@luna/core";
import { MediaItem } from "@luna/lib";
import { getCoverColorsFromMediaItem } from "@jxnxsdev/utils";

export const unloads = new Set<LunaUnload>();
export const { trace, errSignal } = Tracer("[CoverColoredUI]");

const colorStyle = document.createElement("style");
document.head.appendChild(colorStyle);

unloads.add(() => {
  colorStyle.remove();
});

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
  try {
    const colors = await getCoverColorsFromMediaItem(mediaItem, {
      readable: true,
      minLuminance: 80,
    });
    if (!colors) return;

    scheduleColorUpdate(colors.primary);
  } catch (err) {
    trace.msg.err("Error updating colors:", err);
  }
});
