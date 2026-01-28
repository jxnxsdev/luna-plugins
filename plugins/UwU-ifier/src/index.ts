import type { LunaUnload } from "@luna/core";
import { redux, MediaItem, PlayState, ipcRenderer } from "@luna/lib";
import uwuify from "uwuify";
import { settings } from "./Settings";

export { Settings } from "./Settings";

const uwuifier = new uwuify();

export const unloads = new Set<LunaUnload>();

const uwuifiedNodes = new WeakSet<Text>();

function isProbablyUwuified(text: string) {
  return /(?:owo|uwu|\(・`ω´・\)|nya+)/i.test(text);
}

function uwuifyTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        !parent ||
        ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;

    if (uwuifiedNodes.has(textNode)) continue;
    const original = textNode.textContent ?? "";
    if (original.trim() === "" || isProbablyUwuified(original)) continue;

    const uwuified = uwuifier.uwuify(original);
    if (original !== uwuified) {
      textNode.textContent = uwuified;
      uwuifiedNodes.add(textNode);
    }
  }
}

const handledImages = new WeakSet<HTMLImageElement>();
const handledBgImages = new WeakSet<HTMLElement>();
const nekoImages: string[] = [];
const cachedImages: Map<string, HTMLImageElement> = new Map();
let isReplacingImages = false;

async function preloadNekoImages(count = 50) {
  const promises = Array.from({ length: count }, async () => {
    try {
      const res = await fetch("https://nekos.life/api/v2/img/neko");
      const data = await res.json();
      return data.url as string;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(promises);
  nekoImages.push(...results.filter((url): url is string => !!url));
}

async function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (cachedImages.has(url)) {
      resolve(cachedImages.get(url)!);
      return;
    }
    const img = new Image();
    img.onload = () => {
      cachedImages.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function preloadAllNekoImages() {
  await preloadNekoImages(100);
  await Promise.all(nekoImages.map(preloadImage));
}

function getRandomNekoImageUrl(): string | null {
  if (nekoImages.length === 0) return null;
  return nekoImages[Math.floor(Math.random() * nekoImages.length)];
}

function replaceImage(img: HTMLImageElement) {
  if (handledImages.has(img)) return;

  const isNekoSrc = img.src.includes("nekos.life");

  if (isNekoSrc) {
    if (img.srcset || img.sizes) {
      img.srcset = "";
      img.sizes = "";
    }
    handledImages.add(img);
    return;
  }

  const nekoUrl = getRandomNekoImageUrl();
  if (!nekoUrl) return;

  handledImages.add(img);

  img.src = nekoUrl;
  img.srcset = "";
  img.sizes = "";
  img.style.objectFit = "cover";
}

function replaceAllImages(root: Node = document.body) {
  if (isReplacingImages) return;
  isReplacingImages = true;

  const imgs = root.querySelectorAll("img");
  imgs.forEach((img) => {
    if (img instanceof HTMLImageElement) replaceImage(img);
  });

  const elements = root.querySelectorAll<HTMLElement>("*");
  elements.forEach((el) => replaceBackgroundImage(el));

  isReplacingImages = false;
}

function replaceBackgroundImage(el: HTMLElement) {
  if (handledBgImages.has(el)) return;

  const style = getComputedStyle(el);
  const bg = style.backgroundImage;

  if (!bg || bg === "none") return;

  const urlMatch = bg.match(/url\(["']?(.*?)["']?\)/);
  if (!urlMatch) return;

  const currentUrl = urlMatch[1];

  if (currentUrl.includes("nekos.life")) {
    handledBgImages.add(el);
    return;
  }

  const nekoUrl = getRandomNekoImageUrl();
  if (!nekoUrl) return;

  el.style.backgroundImage = `url("${nekoUrl}")`;

  handledBgImages.add(el);
}

uwuifyTextNodes(document.body);

preloadAllNekoImages().then(() => {
  if (settings.replaceImages) replaceAllImages(document.body);

  const observer = new MutationObserver((mutations) => {
    const addedNodes: Node[] = [];

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => addedNodes.push(node));
      } else if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLImageElement &&
        mutation.attributeName === "src"
      ) {
        if (settings.replaceImages) replaceImage(mutation.target);
      } else if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLElement &&
        mutation.attributeName === "style"
      ) {
        if (settings.replaceImages) replaceBackgroundImage(mutation.target);
      }
    }

    if (addedNodes.length > 0) {
      addedNodes.forEach((node) => {
        uwuifyTextNodes(node);
        if (settings.replaceImages) replaceAllImages(document.body);
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "style"],
  });
});

export async function replaceImagesFunc() {
  replaceAllImages(document.body);
}
