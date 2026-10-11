import { test, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  readdir,
  stat,
  utimes,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importAsset } from "../electron/media.js";
import { validWaveform, waveformPaths } from "../src/editor/waveform.js";
import { newProject, newClip, SECOND as S } from "../src/editor/model.js";
import { editProject } from "../src/editor/timeline.js";

test("decoded stereo peak/RMS pyramid preserves silence, sine, ramp, impulse, source mapping and cache identity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "shortcut-waveform-"));
  try {
    const rate = 48000,
      frames = rate * 4,
      data = Buffer.alloc(44 + frames * 4);
    data.write("RIFF");
    data.writeUInt32LE(data.length - 8, 4);
    data.write("WAVEfmt ", 8);
    data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20);
    data.writeUInt16LE(2, 22);
    data.writeUInt32LE(rate, 24);
    data.writeUInt32LE(rate * 4, 28);
    data.writeUInt16LE(4, 32);
    data.writeUInt16LE(16, 34);
    data.write("data", 36);
    data.writeUInt32LE(frames * 4, 40);
    let sum = 0;
    for (let i = 0; i < frames; i++) {
      const t = i / rate;
      const value =
        t < 1
          ? 0
          : t < 2
            ? 0.5 * Math.sin(2 * Math.PI * 440 * t)
            : t < 3
              ? (0.1 + 0.8 * (t - 2)) * Math.sin(2 * Math.PI * 440 * t)
              : i === Math.round(rate * 3.1)
                ? 0.95
                : 0;
      const pcm = Math.round(value * 32767);
      data.writeInt16LE(pcm, 44 + i * 4);
      data.writeInt16LE(-pcm, 46 + i * 4);
      sum += (pcm / 32768) ** 2;
    }
    const file = path.join(root, "stereo.wav"),
      cache = path.join(root, "cache");
    await writeFile(file, data);
    const asset = await importAsset(file, cache),
      wave = asset.waveform;
    expect(validWaveform(wave)).toBe(true);
    if (!validWaveform(wave)) throw new Error("Missing decoded waveform");
    const base = wave.levels[0];
    expect(base.peaks[0]).toEqual(base.peaks[1]);
    expect(base.rms[0]).toEqual(base.rms[1]);
    const range = (start: number, stop: number) =>
      base.peaks[0].slice(
        Math.ceil((start * rate) / base.samplesPerBin),
        Math.floor((stop * rate) / base.samplesPerBin),
      );
    expect(Math.max(...range(0, 0.99))).toBe(0);
    expect(Math.min(...range(1.01, 1.99))).toBeGreaterThan(0.49);
    expect(Math.max(...range(1.01, 1.99))).toBeLessThan(0.501);
    expect(Math.max(...range(2.01, 2.1))).toBeLessThan(0.19);
    expect(Math.min(...range(2.9, 2.99))).toBeGreaterThan(0.8);
    expect(Math.max(...range(3, 4))).toBeCloseTo(0.95, 3);
    for (const level of wave.levels)
      expect(Math.max(...level.peaks[0])).toBeCloseTo(0.95, 3);
    expect(wave.levels.at(-1)!.rms[0][0]).toBeCloseTo(
      Math.sqrt(sum / frames),
      8,
    );
    const p = newProject();
    p.mediaAssets = [asset];
    const clip = newClip(p.tracks[2].id, asset);
    p.tracks[2].clips = [clip];
    const split = editProject(p, { type: "split", ids: [clip.id], at: S });
    const [left, right] = split.tracks[2].clips;
    const trimmed = editProject(split, {
      type: "trim",
      id: right.id,
      edge: "start",
      at: 2 * S,
    }).tracks[2].clips[1];
    for (const zoom of [20, 80, 240]) {
      expect(waveformPaths(wave, left, zoom, 0, zoom - 2).peaks).toBe("");
      expect(waveformPaths(wave, right, zoom, 0, zoom).peaks).not.toBe("");
      expect(waveformPaths(wave, clip, zoom, zoom, zoom)).toEqual(
        waveformPaths(wave, right, zoom, 0, zoom),
      );
      expect(waveformPaths(wave, trimmed, zoom, 0, zoom)).toEqual(
        waveformPaths(wave, clip, zoom, 2 * zoom, zoom),
      );
      const fast = {
        ...right,
        playbackSpeed: 2,
        timelineDuration: right.timelineDuration / 2,
      };
      expect(waveformPaths(wave, fast, zoom, 0, zoom)).toEqual(
        waveformPaths(wave, right, zoom / 2, 0, zoom),
      );
    }
    const cacheFile = path.join(
      cache,
      (await readdir(cache)).find((name) => name.endsWith(".json"))!,
    );
    const modified = (await stat(cacheFile)).mtimeMs;
    const reused = await importAsset(file, cache);
    expect(reused.id).not.toBe(asset.id);
    expect(reused.waveform).toEqual(wave);
    expect((await stat(cacheFile)).mtimeMs).toBe(modified);
    await writeFile(cacheFile, '{"version":2,"levels":[]}');
    expect((await importAsset(file, cache)).waveform).toEqual(wave);
    data.fill(0, 44);
    await writeFile(file, data);
    await utimes(file, new Date(), new Date(Date.now() + 10000));
    const changed = (await importAsset(file, cache)).waveform;
    expect(validWaveform(changed)).toBe(true);
    if (validWaveform(changed))
      expect(changed.levels.at(-1)!.peaks).toEqual([[0], [0]]);
    expect(
      (await readdir(cache)).filter((name) => name.endsWith(".json")),
    ).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
