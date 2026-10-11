import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { run } from "../electron/process.js";
import { importAsset } from "../electron/media.js";
import { render } from "../electron/render.js";
import { saveProject, readProject } from "../electron/project.js";
import {
  newProject,
  newClip,
  newTrack,
  SECOND as S,
} from "../src/editor/model.js";
import { editProject } from "../src/editor/timeline.js";
import { useEditor, effectiveProject } from "../src/stores/editor.js";

test("split layers preserve source frames, crop, links and synchronized audio in MP4", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "shortcut-layers-"));
  try {
    const source = path.join(root, "two-scenes.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x284:r=30:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=160x284:r=30:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=2",
      "-filter_complex",
      "[0:v][1:a][2:v][3:a]concat=n=2:v=1:a=1[v][a]",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      source,
    ]);
    const asset = await importAsset(source, path.join(root, "cache"));
    let p = newProject(160, 284);
    p.mediaAssets = [asset];
    const base = p.tracks[1],
      upper = newTrack("video", "Upper");
    const whole = newClip(base.id, asset);
    whole.timelineDuration = whole.sourceOut = 4 * S;
    base.clips = [whole];
    p.tracks.unshift(upper);
    p = editProject(p, { type: "split", ids: [whole.id], at: 2 * S });
    const right = p.tracks[2].clips[1];
    p = editProject(p, { type: "separateAudio", id: right.id, linked: true });
    p = editProject(p, {
      type: "move",
      ids: [right.id],
      trackId: upper.id,
      delta: -S,
    });
    useEditor.getState().load(p);
    useEditor.getState().beginInteractive("crop");
    useEditor.getState().updateInteractive((draft) => {
      draft.tracks[0].clips[0].transform.crop = {
        left: 0.5,
        right: 0,
        top: 0,
        bottom: 0,
      };
    });
    expect(
      useEditor.getState().project.tracks[0].clips[0].transform.crop,
    ).toBeUndefined();
    expect(
      effectiveProject(useEditor.getState()).tracks[0].clips[0].transform.crop
        ?.left,
    ).toBe(0.5);
    useEditor.getState().commitInteractive();
    p = useEditor.getState().project;
    const saved = path.join(root, "linked.shortcut");
    await saveProject(saved, p);
    p = await readProject(saved);
    expect(p.tracks[0].clips[0].groupId).toBe(p.tracks[3].clips[0].groupId);
    expect(p.tracks[3].clips[0].sourceIn).toBe(2 * S);
    expect(p.tracks[3].clips[0].timelineStart).toBe(S);
    const file = path.join(root, "overlap.mp4");
    await render(p, file, { quality: 18, audioBitrate: 192, hardware: false });
    const pixel = async (file: string, at: number, x: number, y = 140) => [
      ...(await run("ffmpeg", [
        "-v",
        "error",
        "-ss",
        String(at),
        "-i",
        file,
        "-vf",
        `crop=2:2:${x}:${y},scale=1:1`,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ])),
    ];
    expect((await pixel(file, 0.5, 120))[0]).toBeGreaterThan(220);
    expect((await pixel(file, 1.5, 40))[0]).toBeGreaterThan(220);
    expect((await pixel(file, 1.5, 120))[2]).toBeGreaterThan(220);
    expect(Math.max(...(await pixel(file, 2.5, 40)))).toBeLessThan(15);
    expect((await pixel(file, 2.5, 120))[2]).toBeGreaterThan(220);
    const amplitudes = async (at: number) => {
      const pcm = await run("ffmpeg", [
        "-v",
        "error",
        "-ss",
        String(at),
        "-i",
        file,
        "-t",
        "0.2",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "s16le",
        "-",
      ]);
      const count = pcm.length / 2;
      return [440, 880].map((frequency) => {
        let re = 0,
          im = 0;
        for (let i = 0; i < count; i++) {
          const sample = pcm.readInt16LE(i * 2) / 32768;
          re += sample * Math.cos((2 * Math.PI * frequency * i) / 8000);
          im += sample * Math.sin((2 * Math.PI * frequency * i) / 8000);
        }
        return (2 * Math.hypot(re, im)) / count;
      });
    };
    const before = await amplitudes(0.4),
      overlap = await amplitudes(1.4),
      after = await amplitudes(2.4);
    expect(before[0]).toBeGreaterThan(0.08);
    expect(before[1]).toBeLessThan(0.01);
    expect(overlap[0]).toBeGreaterThan(0.08);
    expect(overlap[1]).toBeGreaterThan(0.08);
    expect(overlap[1]).toBeLessThan(0.17); // Extracted sound must not double.
    expect(after[0]).toBeLessThan(0.01);
    expect(after[1]).toBeGreaterThan(0.08);
    [p.tracks[0], p.tracks[2]] = [p.tracks[2], p.tracks[0]];
    const reversed = path.join(root, "reversed.mp4");
    await render(p, reversed, {
      quality: 18,
      audioBitrate: 128,
      hardware: false,
    });
    expect((await pixel(reversed, 1.5, 120))[0]).toBeGreaterThan(220);
    [p.tracks[0], p.tracks[2]] = [p.tracks[2], p.tracks[0]];
    const overlay = p.tracks[0].clips[0];
    overlay.opacity = 0.5;
    overlay.transform = {
      x: 20,
      y: 0,
      scale: 0.5,
      rotation: 90,
      flipX: false,
      flipY: false,
      crop: { left: 0.5, right: 0, top: 0, bottom: 0 },
    };
    const transformed = path.join(root, "transformed.mp4");
    await render(p, transformed, {
      quality: 18,
      audioBitrate: 128,
      hardware: false,
    });
    const mixed = await pixel(transformed, 1.5, 100, 160);
    expect(mixed[0]).toBeGreaterThan(100);
    expect(mixed[2]).toBeGreaterThan(100);
    const uncovered = await pixel(transformed, 1.5, 100, 120);
    expect(uncovered[0]).toBeGreaterThan(220);
    expect(uncovered[2]).toBeLessThan(20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
