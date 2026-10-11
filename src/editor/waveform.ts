import { type Clip, SECOND } from "./model.js";

export interface WaveformLevel {
  samplesPerBin: number;
  peaks: number[][];
  rms: number[][];
}
export interface Waveform {
  version: 2;
  sampleRate: number;
  sampleCount: number;
  levels: WaveformLevel[];
}
export function validWaveform(value: unknown): value is Waveform {
  const w = value as Waveform;
  if (
    !w ||
    w.version !== 2 ||
    w.sampleRate !== 48000 ||
    !Number.isSafeInteger(w.sampleCount) ||
    w.sampleCount <= 0 ||
    w.sampleCount > 6 * 3600 * w.sampleRate ||
    !Array.isArray(w.levels) ||
    !w.levels.length ||
    w.levels.length > 18
  )
    return false;
  let previous = 0,
    channels = 0;
  return w.levels.every((level) => {
    if (
      !level ||
      !Number.isSafeInteger(level.samplesPerBin) ||
      level.samplesPerBin < 1 ||
      (previous && level.samplesPerBin !== previous * 2) ||
      !Array.isArray(level.peaks) ||
      !Array.isArray(level.rms)
    )
      return false;
    previous = level.samplesPerBin;
    channels ||= level.peaks.length;
    if (
      !channels ||
      channels > 64 ||
      level.peaks.length !== channels ||
      level.rms.length !== channels
    )
      return false;
    const bins = Math.ceil(w.sampleCount / level.samplesPerBin);
    if (bins * channels > 131072) return false;
    return [...level.peaks, ...level.rms].every(
      (values) =>
        Array.isArray(values) &&
        values.length === bins &&
        values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    );
  });
}

// ponytail: 131072 base bins across channels; use tiled cache for sample-level long-form zoom.
export function waveformPaths(
  wave: Waveform,
  clip: Clip,
  zoom: number,
  left: number,
  width: number,
) {
  const sourceSamplesPerPixel = (wave.sampleRate * clip.playbackSpeed) / zoom;
  const level =
    [...wave.levels]
      .reverse()
      .find((l) => l.samplesPerBin <= sourceSamplesPerPixel * 2) ??
    wave.levels[0];
  const channels = level.peaks.length,
    height = 32 / channels;
  const peakPaths: string[] = [],
    rmsPaths: string[] = [];
  for (let channel = 0; channel < channels; channel++) {
    const center = (channel + 0.5) * height;
    for (let x = 0; x < width; x += 2) {
      const start =
        (clip.sourceIn / SECOND + ((left + x) / zoom) * clip.playbackSpeed) *
        wave.sampleRate;
      const stop = Math.min(
        (clip.sourceOut / SECOND) * wave.sampleRate,
        start + 2 * sourceSamplesPerPixel,
        wave.sampleCount,
      );
      let peak = 0,
        energy = 0,
        weight = 0;
      for (
        let i = Math.max(0, Math.floor(start / level.samplesPerBin));
        i < Math.ceil(stop / level.samplesPerBin);
        i++
      ) {
        const count = Math.max(
          0,
          Math.min(stop, (i + 1) * level.samplesPerBin, wave.sampleCount) -
            Math.max(start, i * level.samplesPerBin),
        );
        if (!count) continue;
        peak = Math.max(peak, level.peaks[channel][i] ?? 0);
        energy += (level.rms[channel][i] ?? 0) ** 2 * count;
        weight += count;
      }
      const line = (value: number) =>
        `M${x},${(center - value * height * 0.45).toFixed(2)}v${(value * height * 0.9).toFixed(2)}`;
      if (peak) peakPaths.push(line(peak));
      if (weight && energy) rmsPaths.push(line(Math.sqrt(energy / weight)));
    }
  }
  return { peaks: peakPaths.join(" "), rms: rmsPaths.join(" ") };
}
