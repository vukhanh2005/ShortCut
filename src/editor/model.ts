import { type Waveform, validWaveform } from "./waveform.js";
export const SECOND = 1_000_000;
export const MAX_DURATION = 6 * 3600 * SECOND;
export type MediaKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "subtitle";
export interface MediaAsset {
  id: string;
  path: string;
  name: string;
  type: MediaKind;
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
  size: number;
  thumbnail?: string;
  url?: string;
  waveform?: number[] | Waveform;
  missing?: boolean;
  folder: string;
  favorite: boolean;
}
export interface TextStyle {
  text: string;
  font: string;
  size: number;
  color: string;
  outline: number;
  shadow: number;
  background: boolean;
  align: "left" | "center" | "right";
}
export interface Clip {
  id: string;
  mediaAssetId?: string;
  trackId: string;
  name: string;
  timelineStart: number;
  timelineDuration: number;
  sourceIn: number;
  sourceOut: number;
  playbackSpeed: number;
  groupId?: string;
  audioEnabled?: boolean;
  audioOnly?: boolean;
  muted?: boolean;
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    flipX: boolean;
    flipY: boolean;
    crop?: { left: number; right: number; top: number; bottom: number };
  };
  opacity: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  text?: TextStyle;
}
export interface Track {
  id: string;
  type: TrackKind;
  name: string;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  volume?: number;
  clips: Clip[];
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  resolution: { width: number; height: number };
  frameRate: number;
  aspectRatio: string;
  tracks: Track[];
  mediaAssets: MediaAsset[];
  markers?: { id: string; time: number; name: string }[];
  settings: {
    ripple: boolean;
    rippleScope: "all" | "track";
    snapping: boolean;
  };
}
export const uid = () => globalThis.crypto.randomUUID();
export function cloneProject(project: Project): Project {
  const copy = structuredClone({ ...project, mediaAssets: [] });
  // Decoded waveforms are immutable asset caches shared by history snapshots.
  return { ...copy, mediaAssets: project.mediaAssets.map((a) => ({ ...a })) };
}
export const seconds = (time: number) => time / SECOND;
export const ticks = (time: number) => Math.round(time * SECOND);
export const end = (clip: Clip) => clip.timelineStart + clip.timelineDuration;
export const duration = (project: Project) =>
  Math.max(0, ...project.tracks.flatMap((t) => t.clips.map(end)));
export const frame = (project: Project, index: number) =>
  Math.round((index * SECOND) / project.frameRate);
export const quantize = (project: Project, time: number) =>
  frame(project, Math.round((time * project.frameRate) / SECOND));
export function seekFrame(project: Project, time: number): number {
  const length = duration(project);
  let last = Math.max(0, Math.ceil((length * project.frameRate) / SECOND) - 1);
  if (last && frame(project, last) >= length) last--;
  return frame(
    project,
    Math.max(
      0,
      Math.min(last, Math.round((time * project.frameRate) / SECOND)),
    ),
  );
}
export function newTrack(type: TrackKind, name: string): Track {
  return {
    id: uid(),
    type,
    name,
    visible: true,
    locked: false,
    muted: false,
    clips: [],
  };
}
export function newProject(width = 1080, height = 1920, fps = 30): Project {
  return {
    schemaVersion: 1,
    id: uid(),
    name: "Untitled project",
    resolution: { width, height },
    frameRate: fps,
    aspectRatio: `${width}:${height}`,
    tracks: [
      newTrack("subtitle", "Captions"),
      newTrack("video", "Video 1"),
      newTrack("audio", "Voice & music"),
    ],
    mediaAssets: [],
    settings: { ripple: false, rippleScope: "all", snapping: true },
  };
}
export function newClip(trackId: string, asset?: MediaAsset, start = 0): Clip {
  const length = asset && asset.type !== "image" ? asset.duration : 3 * SECOND;
  return {
    id: uid(),
    mediaAssetId: asset?.id,
    trackId,
    name: asset?.name ?? "Your caption",
    timelineStart: start,
    timelineDuration: length,
    sourceIn: 0,
    sourceOut: length,
    playbackSpeed: 1,
    transform: {
      x: 0,
      y: asset ? 0 : 650,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
    },
    opacity: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    ...(!asset
      ? {
          text: {
            text: "Your caption",
            font: "Arial",
            size: 64,
            color: "#ffffff",
            outline: 3,
            shadow: 1,
            background: false,
            align: "center" as const,
          },
        }
      : {}),
  };
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function bounded(
  value: unknown,
  min: number,
  max: number,
  name: string,
  integer = false,
): asserts value is number {
  requireThat(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isSafeInteger(value)),
    `Invalid ${name} (${min}..${max}).`,
  );
}
function label(
  value: unknown,
  name: string,
  max = 1024,
): asserts value is string {
  requireThat(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= max &&
      !value.includes("\0"),
    `Invalid ${name}.`,
  );
}
export function validateProject(input: unknown): asserts input is Project {
  requireThat(
    input !== null && typeof input === "object",
    "Project must be an object.",
  );
  const p = input as Project;
  requireThat(
    p.schemaVersion === 1,
    "Unsupported project version. This build reads schema 1.",
  );
  requireThat(
    !("transitions" in p),
    "Transition entities are not supported by this release. Use clip fades.",
  );
  label(p.id, "project ID");
  label(p.name, "project name");
  label(p.aspectRatio, "aspect ratio");
  bounded(p.resolution?.width, 64, 3840, "width", true);
  bounded(p.resolution?.height, 64, 3840, "height", true);
  requireThat(
    p.resolution.width % 2 === 0 && p.resolution.height % 2 === 0,
    "H.264 dimensions must be even.",
  );
  requireThat(
    [24, 25, 30, 50, 60].includes(p.frameRate),
    "Choose 24, 25, 30, 50 or 60 FPS.",
  );
  requireThat(
    p.settings &&
      ["all", "track"].includes(p.settings.rippleScope) &&
      typeof p.settings.ripple === "boolean" &&
      typeof p.settings.snapping === "boolean",
    "Invalid project settings.",
  );
  requireThat(
    Array.isArray(p.mediaAssets) && p.mediaAssets.length <= 2000,
    "Project supports at most 2000 assets.",
  );
  requireThat(
    Array.isArray(p.tracks) && p.tracks.length > 0 && p.tracks.length <= 32,
    "Project needs 1..32 tracks.",
  );
  const ids = new Set<string>();
  const identity = (id: unknown) => {
    label(id, "entity ID");
    requireThat(!ids.has(id), "Duplicate entity ID.");
    ids.add(id);
  };
  if (p.markers !== undefined) {
    requireThat(
      Array.isArray(p.markers) && p.markers.length <= 512,
      "Project supports at most 512 markers.",
    );
    for (const marker of p.markers) {
      identity(marker.id);
      label(marker.name, "marker name");
      bounded(marker.time, 0, MAX_DURATION, "marker time", true);
    }
  }
  for (const a of p.mediaAssets) {
    identity(a.id);
    label(a.path, "media path", 32767);
    label(a.name, "media name");
    requireThat(
      ["video", "audio", "image"].includes(a.type),
      "Unknown media type.",
    );
    bounded(a.duration, 1, MAX_DURATION, "media duration", true);
    bounded(a.width, 0, 32768, "source width", true);
    bounded(a.height, 0, 32768, "source height", true);
    bounded(a.frameRate, 0, 1000, "source FPS");
    bounded(a.size, 0, Number.MAX_SAFE_INTEGER, "file size", true);
    requireThat(
      typeof a.hasAudio === "boolean" &&
        typeof a.favorite === "boolean" &&
        typeof a.folder === "string",
      "Invalid media metadata.",
    );
    requireThat(
      !a.waveform ||
        (Array.isArray(a.waveform) &&
          a.waveform.length <= 1024 &&
          a.waveform.every(
            (n) =>
              typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
          )) ||
        validWaveform(a.waveform),
      "Invalid waveform.",
    );
  }
  let count = 0;
  for (const t of p.tracks) {
    identity(t.id);
    label(t.name, "track name");
    if (t.volume !== undefined) bounded(t.volume, 0, 2, "track volume");
    requireThat(
      ["video", "audio", "subtitle"].includes(t.type),
      "Unknown track type.",
    );
    requireThat(
      [t.visible, t.locked, t.muted].every((v) => typeof v === "boolean") &&
        Array.isArray(t.clips),
      "Invalid track.",
    );
    const sorted = [...t.clips].sort(
      (a, b) => a.timelineStart - b.timelineStart,
    );
    let lastEnd = 0;
    for (const c of sorted) {
      count++;
      identity(c.id);
      label(c.name, "clip name");
      requireThat(
        !("effects" in c) && !("keyframes" in c),
        "Unsupported effect or keyframe data. This release supports static transforms and fades.",
      );
      requireThat(c.trackId === t.id, "Clip belongs to another track.");
      bounded(c.timelineStart, 0, MAX_DURATION, "clip start", true);
      bounded(c.timelineDuration, 1, MAX_DURATION, "clip duration", true);
      requireThat(end(c) <= MAX_DURATION, "Timeline exceeds six-hour limit.");
      requireThat(
        c.timelineStart >= lastEnd,
        `Clips overlap on "${t.name}". Use a separate layer.`,
      );
      lastEnd = end(c);
      bounded(c.sourceIn, 0, MAX_DURATION, "source in", true);
      bounded(c.sourceOut, 1, MAX_DURATION, "source out", true);
      bounded(c.playbackSpeed, 0.25, 4, "speed");
      requireThat(
        Math.abs(
          c.sourceOut -
            c.sourceIn -
            Math.round(c.timelineDuration * c.playbackSpeed),
        ) <= 2,
        "Source range does not match clip duration and speed.",
      );
      const a = p.mediaAssets.find((m) => m.id === c.mediaAssetId);
      requireThat(
        (!!a && !c.text) || (!c.mediaAssetId && !!c.text),
        "Clip needs either a media asset or text.",
      );
      if (a) {
        requireThat(
          a.type === "image" || c.sourceOut <= a.duration + 2,
          "Trim exceeds available source media.",
        );
        requireThat(
          t.type !== "subtitle" && (t.type !== "audio" || a.hasAudio),
          "Media does not match track type.",
        );
        requireThat(
          t.type !== "video" || a.type !== "audio",
          "Audio belongs on an audio track.",
        );
      } else
        requireThat(
          t.type !== "audio",
          "Text cannot be placed on audio tracks.",
        );
      bounded(c.opacity, 0, 1, "opacity");
      bounded(c.volume, 0, 2, "volume");
      requireThat(
        c.muted === undefined || typeof c.muted === "boolean",
        "Invalid clip mute.",
      );
      requireThat(
        c.audioEnabled === undefined || typeof c.audioEnabled === "boolean",
        "Invalid audio enabled flag.",
      );
      requireThat(
        c.audioOnly === undefined || typeof c.audioOnly === "boolean",
        "Invalid audio-only flag.",
      );
      requireThat(
        !c.audioOnly || t.type === "audio",
        "Extracted audio belongs on an audio track.",
      );
      bounded(c.fadeIn, 0, c.timelineDuration, "fade in", true);
      bounded(c.fadeOut, 0, c.timelineDuration, "fade out", true);
      requireThat(
        c.fadeIn + c.fadeOut <= c.timelineDuration,
        "Fades exceed clip duration.",
      );
      bounded(c.transform?.x, -7680, 7680, "position X");
      bounded(c.transform?.y, -7680, 7680, "position Y");
      bounded(c.transform?.scale, 0.1, 4, "scale");
      bounded(c.transform?.rotation, -180, 180, "rotation");
      if (c.transform.crop !== undefined) {
        const crop = c.transform.crop;
        for (const edge of ["left", "right", "top", "bottom"] as const)
          bounded(crop?.[edge], 0, 1, `crop ${edge}`);
        requireThat(
          !c.text && crop.left + crop.right < 1 && crop.top + crop.bottom < 1,
          "Crop must leave visible media.",
        );
      }
      requireThat(
        typeof c.transform.flipX === "boolean" &&
          typeof c.transform.flipY === "boolean",
        "Invalid flip.",
      );
      if (c.groupId !== undefined) label(c.groupId, "link ID");
      if (c.text) {
        label(c.text.text, "caption", 10000);
        label(c.text.font, "font", 80);
        requireThat(
          /^[\p{L}\p{N} _-]+$/u.test(c.text.font),
          "Invalid font name.",
        );
        bounded(c.text.size, 8, 300, "font size");
        bounded(c.text.outline, 0, 10, "outline");
        bounded(c.text.shadow, 0, 10, "shadow");
        requireThat(
          /^#[0-9a-f]{6}$/i.test(c.text.color) &&
            ["left", "center", "right"].includes(c.text.align) &&
            typeof c.text.background === "boolean",
          "Invalid text style.",
        );
      }
    }
  }
  requireThat(
    count <= 512,
    "This release supports at most 512 timeline clips.",
  );
  const groups = new Map<string, Clip[]>();
  for (const c of p.tracks.flatMap((t) => t.clips))
    if (c.groupId) groups.set(c.groupId, [...(groups.get(c.groupId) ?? []), c]);
  for (const group of groups.values())
    requireThat(
      group.every(
        (c) =>
          c.timelineStart === group[0].timelineStart &&
          c.timelineDuration === group[0].timelineDuration,
      ),
      "Linked clips must remain synchronized. Unlink before independent timing edits.",
    );
}
export function parseProject(json: string): Project {
  const data: unknown = JSON.parse(json);
  validateProject(data);
  return data;
}
export function serializeProject(p: Project): string {
  validateProject(p);
  return JSON.stringify(
    {
      ...p,
      mediaAssets: p.mediaAssets.map(
        ({ url, thumbnail, waveform, missing, ...asset }) => asset,
      ),
    },
    null,
    2,
  );
}
export function formatTime(time: number): string {
  const ms = Math.floor(time / 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
