import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { widgetsDirectory } from "expo-widgets";
import {
  DEFAULT_GAZE,
  drawPolygonAvatarFrame,
  EXPRESSIONS,
  FACE_BOX,
  GAZE,
  MOUTHS,
  POOLS,
  shapeOf,
  type PolygonEngine,
} from "../components/polygon-avatar/polygon-avatar-core";
import { createPolygonAvatarScene } from "../components/polygon-avatar/polygon-avatar-scene";
import type { MockSvgElement } from "../components/polygon-avatar/mock-svg-element";

export type CallArtworkMate = {
  id: string;
  shape?: string;
  gradient: [string, string, string];
  avatarUri?: string;
  speakingAvatarUri?: string;
};

// Native SwiftUI cannot run the mascot's React renderer. Render its exact scene and face
// engine once per appearance/state, then share transparent PNGs with the widget process.
// 320px covers 80pt hero @3x retina with room for the glow ring.
const ARTWORK_SIZE = 320;
const MAX_CACHE_ENTRIES = 24;
const renders = new Map<string, Promise<string>>();

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function serializeNode(node: MockSvgElement): string {
  const attrs = { ...node.attrs, ...(node.style.opacity === undefined ? {} : { opacity: node.style.opacity }) };
  const attributes = Object.entries(attrs).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
  return `<${node.tagName}${attributes}>${node.children.map(serializeNode).join("")}</${node.tagName}>`;
}

/** Uses the same silhouettes, clipping, gradient, face placement and expression paths as MateAvatar. */
export function callMateArtworkSvg(mate: CallArtworkMate, speaking: boolean): string {
  const state = speaking ? "humming" : "listening";
  const expression = POOLS[state][0]!;
  const rings = EXPRESSIONS[expression]!;
  const mouth = MOUTHS[expression]!;
  const gaze = GAZE[expression]!;
  const scene = createPolygonAvatarScene("call-mate", { shape: shapeOf(mate.shape), gradient: mate.gradient });
  const engine: PolygonEngine = {
    current: rings, target: rings, currentMouth: mouth, targetMouth: mouth,
    currentGaze: gaze, targetGaze: gaze, expression, morph: 1, velocity: 0,
    blinkStart: null, spinStart: null, spinDuration: 0, springOverride: null,
    last: 0, stateStart: 0, lastState: state, lastBodyTransform: "",
    props: {
      state, gaze: DEFAULT_GAZE, turn: 0, spring: 1, eyeScale: 1,
      paused: true, lookAround: 0.35, motionStrength: 0, effects: false,
      glyphs: false, life: false, saccadeSeed: 0, sequenceMotion: null,
    },
  };
  drawPolygonAvatarFrame(engine, scene.layers, scene.paint, "call-mate", 0, 0, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTWORK_SIZE}" height="${ARTWORK_SIZE}" viewBox="-15 -15 ${FACE_BOX + 30} ${FACE_BOX + 30}">${scene.root.children.map(serializeNode).join("")}</svg>`;
}

async function renderArtwork(mate: CallArtworkMate, speaking: boolean): Promise<string> {
  if (!widgetsDirectory) throw new Error("The shared widget image directory is unavailable");
  const svg = callMateArtworkSvg(mate, speaking);
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, svg);
  const directory = new Directory(widgetsDirectory, "mates");
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, `${digest}.png`);
  if (destination.exists && destination.size > 0) return destination.uri;

  const source = new File(Paths.cache, `call-mate-${digest}.svg`);
  source.create({ overwrite: true });
  source.write(svg);
  let decoded: Awaited<ReturnType<typeof Image.loadAsync>> | undefined;
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let rendered: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>["renderAsync"]>> | undefined;
  let temporary: File | undefined;
  try {
    // The native decoder rasterizes SVG when max dimensions are provided. Passing its
    // SharedRef to the manipulator avoids UIImage's inability to decode raw SVG data.
    decoded = await Image.loadAsync(source.uri, { maxWidth: ARTWORK_SIZE, maxHeight: ARTWORK_SIZE });
    context = ImageManipulator.manipulate(decoded);
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1 });
    temporary = new File(saved.uri);
    temporary.copy(destination);
    return destination.uri;
  } finally {
    decoded?.release();
    rendered?.release();
    context?.release();
    if (source.exists) source.delete();
    if (temporary?.exists) temporary.delete();
  }
}

function getArtwork(mate: CallArtworkMate, speaking: boolean): Promise<string> {
  const key = JSON.stringify([mate.shape ?? "hexagon", mate.gradient, speaking]);
  let pending = renders.get(key);
  if (!pending) {
    // Evict oldest entries when the cache grows beyond the limit.
    if (renders.size >= MAX_CACHE_ENTRIES) {
      const oldest = renders.keys().next().value;
      if (oldest !== undefined) renders.delete(oldest);
    }
    pending = renderArtwork(mate, speaking).catch((error: unknown) => {
      renders.delete(key);
      throw error;
    });
    renders.set(key, pending);
  }
  return pending;
}

/** Image preparation failure must never prevent the call or its text-only activity. */
export async function prepareCallActivityArtwork<T extends { mates: CallArtworkMate[] }>(props: T): Promise<T> {
  const mates = await Promise.all(props.mates.map(async (mate) => {
    try {
      const [avatarUri, speakingAvatarUri] = await Promise.all([getArtwork(mate, false), getArtwork(mate, true)]);
      return { ...mate, avatarUri, speakingAvatarUri };
    } catch (error) {
      console.warn("[call-live-activity] Mate artwork unavailable:", error instanceof Error ? error.message : String(error));
      return mate;
    }
  }));
  return { ...props, mates };
}
