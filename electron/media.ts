import {
  mkdir,
  stat,
  access,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { run } from "./process.js";
import { analyzeWaveform } from "./waveform.js";
import { validWaveform } from "../src/editor/waveform.js";
import {
  MAX_DURATION,
  type MediaAsset,
  ticks,
  seconds,
} from "../src/editor/model.js";
export interface Probe {
  streams: {
    codec_type: string;
    codec_name?: string;
    channels?: number;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    duration?: string;
    side_data_list?: { rotation?: number }[];
  }[];
  format: { duration?: string; size?: string };
}
export async function probe(file: string): Promise<Probe> {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(result.toString()) as Probe;
}
export function validateReplacement(original: MediaAsset, loaded: MediaAsset) {
  if (loaded.type !== original.type)
    throw new Error("Replacement must have the same media type.");
  if (original.hasAudio && !loaded.hasAudio)
    throw new Error("Replacement must preserve the original audio stream.");
  if (loaded.type !== "image" && loaded.duration < original.duration)
    throw new Error(
      "Replacement is shorter than original media. Choose a file at least as long to preserve source ranges.",
    );
}
export async function importAsset(
  file: string,
  cache: string,
): Promise<MediaAsset> {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.includes("\0"))
    throw new Error("Choose a local media file.");
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Media path is not a file.");
  const ext = path.extname(file).toLowerCase();
  if (
    ![
      ".mp4",
      ".mov",
      ".mkv",
      ".webm",
      ".mp3",
      ".wav",
      ".aac",
      ".m4a",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
    ].includes(ext)
  )
    throw new Error("Unsupported media extension.");
  const metadata = await probe(file),
    video = metadata.streams.find((s) => s.codec_type === "video"),
    audio = metadata.streams.some((s) => s.codec_type === "audio");
  const type = [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
    ? "image"
    : video
      ? "video"
      : "audio";
  if (!video && !audio) throw new Error("No decodable video or audio stream.");
  const length =
    type === "image"
      ? 5_000_000
      : ticks(Number(metadata.format.duration ?? video?.duration));
  if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_DURATION)
    throw new Error("Media duration is invalid or exceeds six hours.");
  const rate = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const rotation =
    video?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0;
  const swap = Math.abs(rotation) % 180 === 90;
  const asset: MediaAsset = {
    id: randomUUID(),
    path: file,
    name: path.basename(file),
    type,
    duration: length,
    width: (swap ? video?.height : video?.width) ?? 0,
    height: (swap ? video?.width : video?.height) ?? 0,
    frameRate: rate[1] ? rate[0] / rate[1] : 0,
    hasAudio: audio,
    size: info.size,
    folder: "",
    favorite: false,
  };
  await mkdir(cache, { recursive: true });
  const key = createHash("sha256")
    .update(
      `${file}:${info.size}:${info.mtimeMs}:wave-v2-48000-allchannels-256-131072`,
    )
    .digest("hex");
  if (video) {
    const thumbnail = path.join(cache, `${key}.jpg`);
    try {
      await access(thumbnail);
    } catch {
      await run("ffmpeg", [
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=240:160:force_original_aspect_ratio=decrease",
        thumbnail,
      ]);
    }
    asset.thumbnail = thumbnail;
  }
  if (audio) {
    const wavePath = path.join(cache, `${key}.json`);
    try {
      const cached: unknown = JSON.parse(await readFile(wavePath, "utf8"));
      if (!validWaveform(cached))
        throw new Error("Rebuild outdated waveform cache.");
      asset.waveform = cached;
    } catch {
      asset.waveform = await analyzeWaveform(
        file,
        seconds(length),
        metadata.streams.find((s) => s.codec_type === "audio")?.channels ?? 1,
      );
      await writeFile(wavePath, JSON.stringify(asset.waveform));
    }
  }
  return asset;
}
export async function makeProxy(
  asset: MediaAsset,
  cache: string,
  signal?: AbortSignal,
): Promise<string> {
  if (asset.type !== "video")
    throw new Error("Only video needs a preview proxy.");
  const sourceStat = await stat(asset.path);
  const key = createHash("sha256")
    .update(`${asset.path}:${sourceStat.size}:${sourceStat.mtimeMs}`)
    .digest("hex");
  const target = path.join(cache, `${key}-proxy.mp4`);
  try {
    await access(target);
    return target;
  } catch {
    /* Generate only when no completed proxy exists. */
  }
  const used = (
    await Promise.all(
      (await readdir(cache)).map(
        async (file) => (await stat(path.join(cache, file))).size,
      ),
    )
  ).reduce((a, b) => a + b, 0);
  const limit = Math.min(256 * 1024 * 1024, 480 * 1024 * 1024 - used);
  if (limit < 16 * 1024 * 1024)
    throw new Error(
      "Preview cache is full. Remove unused proxies from the app cache before generating more.",
    );
  try {
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-i",
        asset.path,
        "-vf",
        "scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "26",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-fs",
        String(limit),
        target,
      ],
      { timeout: 3600000, signal },
    );
    if (
      Math.abs(
        Number((await probe(target)).format.duration) - seconds(asset.duration),
      ) > 0.15
    )
      throw new Error(
        "Proxy exceeded cache budget; original media is preserved. Use a shorter source.",
      );
    return target;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
export async function pruneCache(cache: string, budget = 512 * 1024 * 1024) {
  await mkdir(cache, { recursive: true });
  const entries = await Promise.all(
    (await readdir(cache)).map(async (name) => {
      const file = path.join(cache, name);
      return { file, info: await stat(file) };
    }),
  );
  let size = entries.reduce((sum, e) => sum + e.info.size, 0);
  for (const e of entries.sort((a, b) => a.info.mtimeMs - b.info.mtimeMs))
    if (size > budget && e.info.isFile()) {
      await rm(e.file, { force: true });
      size -= e.info.size;
    }
}
