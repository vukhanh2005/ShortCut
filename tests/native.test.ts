import { beforeAll, afterAll, test, expect } from "vitest";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { run } from "../electron/process.js";
import { mediaResponse } from "../electron/media-response.js";
import { importAsset, probe } from "../electron/media.js";
import { buildRenderPlan, render, detectNvenc } from "../electron/render.js";
import { readProject, saveProject } from "../electron/project.js";
import {
  newProject,
  newClip,
  newTrack,
  SECOND as S,
  type Project,
  validateProject,
} from "../src/editor/model.js";
let root: string, project: Project, output: string;
test("hardware request runs real NVENC trial and produces a validated output or CPU fallback", async () => {
  const available = await detectNvenc(),
    messages: string[] = [];
  const p = structuredClone(project);
  p.resolution = { width: 640, height: 360 };
  p.aspectRatio = "16:9";
  await render(
    p,
    path.join(root, "gpu.mp4"),
    { quality: 23, audioBitrate: 128, hardware: true },
    undefined,
    (event) => messages.push(event.message),
  );
  expect(
    messages.some(
      (m) => m === "Encoding with NVENC" || m === "Encoding with CPU",
    ),
  ).toBe(true);
  if (available) expect(messages).toContain("Encoding with NVENC");
});
test("media transport supports byte ranges, suffixes, HEAD and invalid ranges", async () => {
  const file = path.join(root, "range.bin");
  await writeFile(file, Buffer.from("0123456789"));
  const request = (range: string) =>
    new Request("https://local/media", { headers: { Range: range } });
  const partial = await mediaResponse(file, request("bytes=2-5"));
  expect(partial.status).toBe(206);
  expect(partial.headers.get("Content-Range")).toBe("bytes 2-5/10");
  expect(await partial.text()).toBe("2345");
  expect(await (await mediaResponse(file, request("bytes=-3"))).text()).toBe(
    "789",
  );
  expect((await mediaResponse(file, request("bytes=99-"))).status).toBe(416);
  const head = await mediaResponse(
    file,
    new Request("https://local/media", { method: "HEAD" }),
  );
  expect(head.headers.get("Content-Length")).toBe("10");
  expect(await head.text()).toBe("");
});
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "shortcut-tests-"));
  const red = path.join(root, "Đỏ tiếng Việt.mp4"),
    blue = path.join(root, "blue.mp4"),
    audio = path.join(root, "voice.wav"),
    image = path.join(root, "green.png");
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=160x284:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    red,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=blue:s=160x284:r=30:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    blue,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=3",
    audio,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=green:s=80x80",
    "-frames:v",
    "1",
    image,
  ]);
  const assets = [];
  for (const file of [red, blue, audio, image])
    assets.push(await importAsset(file, path.join(root, "cache")));
  project = newProject(160, 284);
  project.mediaAssets = assets;
  const c = newClip(project.tracks[1].id, assets[0]);
  c.timelineDuration = S;
  c.sourceIn = S;
  c.sourceOut = 3 * S;
  c.playbackSpeed = 2;
  const b = newClip(project.tracks[1].id, assets[1], S);
  b.timelineDuration = 2 * S;
  b.sourceOut = 2 * S;
  project.tracks[1].clips = [c, b];
  const voice = newClip(project.tracks[2].id, assets[2]);
  voice.fadeIn = S / 4;
  voice.fadeOut = S / 4;
  voice.volume = 0.5;
  project.tracks[2].clips = [voice];
  const overlayTrack = newTrack("video", "Overlay"),
    overlay = newClip(overlayTrack.id, assets[3], S / 2);
  overlay.timelineDuration = S / 2;
  overlay.sourceOut = S;
  overlay.playbackSpeed = 2;
  overlay.transform.scale = 0.5;
  overlayTrack.clips = [overlay];
  project.tracks.unshift(overlayTrack);
  const caption = newClip(project.tracks[1].id, undefined, 2 * S);
  caption.timelineDuration = S;
  caption.sourceOut = S;
  caption.transform.y = 0;
  caption.text!.text = "Xin chào";
  caption.text!.size = 24;
  caption.text!.outline = 1;
  project.tracks[1].clips = [caption];
  validateProject(project);
  output = path.join(root, "edited.mp4");
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
test("imports real Unicode video, silent video, audio and image with thumbnails and peaks", async () => {
  expect(project.mediaAssets.map((a) => a.type)).toEqual([
    "video",
    "video",
    "audio",
    "image",
  ]);
  expect(project.mediaAssets[1].hasAudio).toBe(false);
  expect((await stat(project.mediaAssets[0].thumbnail!)).size).toBeGreaterThan(
    0,
  );
  expect(Math.max(...project.mediaAssets[2].waveform!)).toBeGreaterThan(0.05);
});
test("atomic persistence preserves last known-good backup and ignores interrupted temp", async () => {
  const file = path.join(root, "project.shortcut");
  await saveProject(file, project);
  await writeFile(`${file}.interrupted.tmp`, "{broken");
  expect((await readProject(file)).tracks).toEqual(project.tracks);
  const changed = structuredClone(project);
  changed.name = "Changed";
  await saveProject(file, changed);
  expect((await readProject(`${file}.bak`)).name).toBe(project.name);
  expect((await readProject(file)).name).toBe("Changed");
  changed.tracks[2].clips[0].sourceOut = -1;
  await expect(saveProject(file, changed)).rejects.toThrow();
  expect((await readProject(file)).name).toBe("Changed");
});
test("real render respects trim, speed, layers, text and audio; probe and decoded pixel/audio checks", async () => {
  const progress: number[] = [];
  await render(
    project,
    output,
    { quality: 23, audioBitrate: 128, hardware: false },
    undefined,
    (p) => progress.push(p.fraction),
  );
  const meta = await probe(output);
  expect(Number(meta.format.duration)).toBeCloseTo(3, 1);
  expect(meta.streams.some((s) => s.codec_name === "aac")).toBe(true);
  expect(progress.at(-1)).toBe(1);
  const pixel = async (at: number, filter = "crop=2:2:80:142,scale=1:1") => [
    ...(await run("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(at),
      "-i",
      output,
      "-vf",
      filter,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ])),
  ];
  const red = await pixel(0.25),
    green = await pixel(0.85),
    blue = await pixel(1.5);
  expect(red[0]).toBeGreaterThan(200);
  expect(red[2]).toBeLessThan(30);
  expect(green[1]).toBeGreaterThan(90);
  expect(green[0]).toBeLessThan(30);
  expect(blue[2]).toBeGreaterThan(200);
  expect(blue[0]).toBeLessThan(30);
  const captionPixels = await pixel(2.5, "crop=140:50:10:117");
  let whitePixels = 0;
  for (let i = 0; i < captionPixels.length; i += 3)
    if (
      captionPixels[i] > 180 &&
      captionPixels[i + 1] > 180 &&
      captionPixels[i + 2] > 180
    )
      whitePixels++;
  expect(whitePixels).toBeGreaterThan(50);
  const audio = await run("ffmpeg", [
    "-v",
    "error",
    "-ss",
    "1.2",
    "-i",
    output,
    "-t",
    "0.1",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "s16le",
    "-",
  ]);
  let energy = 0;
  for (let i = 0; i < audio.length; i += 2)
    energy += (audio.readInt16LE(i) / 32768) ** 2;
  expect(Math.sqrt(energy / (audio.length / 2))).toBeGreaterThan(0.01);
});
test("cancel terminates render and removes incomplete outputs", async () => {
  const controller = new AbortController();
  const target = path.join(root, "cancelled.mp4");
  let started = false;
  await expect(
    render(
      project,
      target,
      { quality: 23, audioBitrate: 128, hardware: false },
      controller.signal,
      (p) => {
        if (p.fraction < 0.99) {
          started = true;
          controller.abort();
        }
      },
    ),
  ).rejects.toThrow("cancel");
  expect(started).toBe(true);
  expect(await readdir(root)).not.toContain("cancelled.mp4");
  expect((await readdir(root)).some((n) => n.startsWith(".shortcut-"))).toBe(
    false,
  );
});
test("missing media and existing output fail without damaging files", async () => {
  const p = structuredClone(project);
  p.mediaAssets[0].path = path.join(root, "missing.mp4");
  await expect(
    render(p, path.join(root, "missing-export.mp4"), {
      quality: 23,
      audioBitrate: 128,
      hardware: false,
    }),
  ).rejects.toThrow("ffmpeg failed");
  const occupied = path.join(root, "occupied.mp4");
  await writeFile(occupied, "keep me");
  await expect(
    render(project, occupied, {
      quality: 23,
      audioBitrate: 128,
      hardware: false,
    }),
  ).rejects.toThrow();
  expect(await readFile(occupied, "utf8")).toBe("keep me");
});
