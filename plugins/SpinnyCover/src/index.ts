import type { LunaUnload } from "@luna/core";
import { MediaItem, PlayState } from "@luna/lib";
import { settings } from "./Settings";


export const unloads = new Set<LunaUnload>();

const styles = document.createElement("style");
document.head.appendChild(styles);

styles.textContent = `
#spinnyCoverBg, #spinnyCoverBgNext {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 150vmax;
    height: 150vmax;
    transform: translate(-50%, -50%);
    z-index: -1;
    background-size: cover;
    background-position: center;
    filter: blur(var(--spinny-cover-blur));
    animation: spinnyCoverAnimation var(--spinny-cover-speed) linear infinite;
    pointer-events: none;
    opacity: 1;
    transition: opacity 1s ease-in-out;
}

#spinnyCoverBgNext {
    position: absolute;
    opacity: 0;
    animation: none;
}

@keyframes spinnyCoverAnimation {
    from {
        transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
        transform: translate(-50%, -50%) rotate(360deg);
    }
}

#wimp,
main,
[class^="_sidebarWrapper"],
[class^="_mainContainer"],
[class*="smallHeader"],
#footerPlayer,
#sidebar,
[class^="_bar"],
aside[aria-label="Navigation sidebar"],
[data-test="main-layout-header"],
[class*="_solidHeader_"],
.enable-scrollbar-styles ::-webkit-scrollbar-corner,
.enable-scrollbar-styles ::-webkit-scrollbar-track {
    background-color: color-mix(
        in srgb,
        var(--wave-color-solid-base-brighter),
        transparent 70%
    ) !important;
}

[class^="_sectionHeader"],
[class*="_sectionHeader_"] {
    background: transparent !important;
    background-color: transparent !important;
}

#nowPlaying > [class^="_innerContainer"] {
    height: calc(100vh - 126px);
    overflow: hidden;
}

[class^="_bottomGradient"] {
    display: none;
}

[class*="smallHeader--"]::before {
    background-image: var(--cover-gradient) !important;
    background-color: var(--wave-color-solid-base-brighter);
    filter: unset;
    background-blend-mode: normal;
}

[class*="emptyStateImage"] {
    background-color: transparent !important;
}

[data-test="search-results-top"] > [class*="container"]::before,
[data-test="search-results-normal"] > [class*="container"]::before {
    background-image: var(--cover-gradient);
    z-index: -1;
    left: -36px;
    right: -36px;
    height: calc(var(--topSpacing) + 50px);
}

[data-test="search-results-normal"] > [class*="container"] > [class*="divider"],
[data-test="search-results-top"] > [class*="container"] > [class*="divider"] {
    display: none;
}

[data-test="search-results-top"] > [class*="container"] {
    background-color: unset;
}

[class^="_tabListWrapper"] {
    background-image: linear-gradient(180deg, rgb(var(--cover-DarkMuted)) 70%, transparent) !important;
}
`;

const audioPlayer = document.createElement("audio");
audioPlayer.id = "spinnyCoverAudio";
audioPlayer.src = "https://www.myinstants.com/media/sounds/helicopter-helicopter-parakofer-parakofer.mp3";
audioPlayer.volume = 1;
audioPlayer.style.display = "none";
document.body.appendChild(audioPlayer);

const helicopterGif = document.createElement("img");
helicopterGif.src = "https://media0.giphy.com/media/aWXhHFliOBOoZK89iu/giphy.gif";
helicopterGif.id = "spinnyCoverHelicopter";
helicopterGif.style.position = "fixed";
helicopterGif.style.top = "50%";
helicopterGif.style.left = "50%";
helicopterGif.style.transform = "translate(-50%, -50%)";
helicopterGif.style.zIndex = "9999";
helicopterGif.style.display = "none";
document.body.appendChild(helicopterGif);

const coverBg = document.createElement("div");
coverBg.id = "spinnyCoverBg";
document.body.appendChild(coverBg);

const coverBgNext = document.createElement("div");
coverBgNext.id = "spinnyCoverBgNext";
document.body.appendChild(coverBgNext);

const invertedSpeed = 25000 - settings.spinSpeed * 25;
document.documentElement.style.setProperty("--spinny-cover-speed", `${invertedSpeed}ms`);
document.documentElement.style.setProperty("--spinny-cover-blur", `${settings.blurPercentage / 5}px`);

async function setInitialCover() {
    let mediaItem = await MediaItem.fromPlaybackContext();
    if (!mediaItem) return;
    const url = await mediaItem.coverUrl();
    if (!url) return;
    coverBg.style.backgroundImage = `url("${url}")`;
    if (settings.stopOnPause) {
        coverBg.style.animationPlayState = "paused";
    } else {
        coverBg.style.animationPlayState = "running";
    }
}
setInitialCover();

MediaItem.onMediaTransition(unloads, async (mediaItem) => {
    if (!mediaItem) return;
    const url = await mediaItem.coverUrl();
    if (!url) return;
    coverBgNext.style.backgroundImage = `url("${url}")`;
    coverBgNext.style.opacity = "1";
    coverBg.style.opacity = "0";
    setTimeout(() => {
        coverBg.style.backgroundImage = `url("${url}")`;
        coverBg.style.opacity = "1";
        coverBgNext.style.opacity = "0";
    }, 100);
});

PlayState.onState(unloads, (state) => {
    if (settings.stopOnPause) {
        if (state === "NOT_PLAYING") {
            coverBg.style.animationPlayState = "paused";
        } else {
            coverBg.style.animationPlayState = "running";
        }
    } else {
        coverBg.style.animationPlayState = "running";
    }
});

export { Settings } from "./Settings";

unloads.add(() => {
    styles.remove();
    coverBg.remove();
    coverBgNext.remove();
    audioPlayer.remove();
    helicopterGif.remove();
    document.documentElement.style.removeProperty("--spinny-cover-speed");
    document.documentElement.style.removeProperty("--spinny-cover-blur");
    console.log("Unloading SpinnyCover");
    document.querySelectorAll("#spinnyCoverAudio").forEach(el => el.remove());
    document.querySelectorAll("#spinnyCoverBg, #spinnyCoverBgNext").forEach(el => el.remove());

});
