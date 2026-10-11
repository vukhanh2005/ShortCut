import { run } from "./process.js";
import {
  type Waveform,
  type WaveformLevel,
  validWaveform,
} from "../src/editor/waveform.js";

export async function analyzeWaveform(
  file: string,
  duration: number,
  channels: number,
): Promise<Waveform> {
  if (!Number.isInteger(channels) || channels < 1 || channels > 64)
    throw new Error("Audio waveform needs 1 to 64 channels.");
  const sampleRate = 48000;
  const samplesPerBin = Math.max(
    188,
    Math.ceil(((duration + 1) * sampleRate) / Math.floor(131072 / channels)),
  );
  const base: WaveformLevel = {
    samplesPerBin,
    peaks: Array.from({ length: channels }, () => []),
    rms: Array.from({ length: channels }, () => []),
  };
  let sampleCount = 0,
    count = 0,
    carry = Buffer.alloc(0);
  const peaks = Array<number>(channels).fill(0),
    energy = Array<number>(channels).fill(0);
  const flush = () => {
    if (!count) return;
    for (let c = 0; c < channels; c++) {
      base.peaks[c].push(peaks[c]);
      base.rms[c].push(Math.sqrt(energy[c] / count));
      peaks[c] = 0;
      energy[c] = 0;
    }
    count = 0;
    if (base.peaks[0].length * channels > 131072)
      throw new Error("Decoded audio exceeds waveform cache budget.");
  };
  await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-vn",
      "-ar",
      String(sampleRate),
      "-f",
      "s16le",
      "-",
    ],
    {
      timeout: 300000,
      onStdout(chunk) {
        const data = Buffer.concat([carry, chunk]),
          bytesPerFrame = channels * 2;
        const size = data.length - (data.length % bytesPerFrame);
        for (let i = 0; i < size; i += bytesPerFrame) {
          for (let c = 0; c < channels; c++) {
            const value = data.readInt16LE(i + c * 2) / 32768;
            peaks[c] = Math.max(peaks[c], Math.abs(value));
            energy[c] += value * value;
          }
          sampleCount++;
          count++;
          if (count === samplesPerBin) flush();
        }
        carry = Buffer.from(data.subarray(size));
      },
    },
  );
  flush();
  const wave: Waveform = {
    version: 2,
    sampleRate,
    sampleCount,
    levels: [base],
  };
  while (wave.levels.at(-1)!.peaks[0].length > 1) {
    const previous = wave.levels.at(-1)!;
    const next: WaveformLevel = {
      samplesPerBin: previous.samplesPerBin * 2,
      peaks: [],
      rms: [],
    };
    for (let c = 0; c < channels; c++) {
      const p: number[] = [],
        r: number[] = [];
      for (let i = 0; i < previous.peaks[c].length; i += 2) {
        const left = Math.min(
          previous.samplesPerBin,
          sampleCount - i * previous.samplesPerBin,
        );
        const right = Math.max(
          0,
          Math.min(
            previous.samplesPerBin,
            sampleCount - (i + 1) * previous.samplesPerBin,
          ),
        );
        p.push(Math.max(previous.peaks[c][i], previous.peaks[c][i + 1] ?? 0));
        r.push(
          Math.sqrt(
            (previous.rms[c][i] ** 2 * left +
              (previous.rms[c][i + 1] ?? 0) ** 2 * right) /
              (left + right),
          ),
        );
      }
      next.peaks.push(p);
      next.rms.push(r);
    }
    wave.levels.push(next);
  }
  if (!validWaveform(wave)) throw new Error("Decoded waveform is invalid.");
  return wave;
}
