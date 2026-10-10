import { mkdtemp, writeFile, rm, stat, link } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  type Clip,
  type Project,
  duration,
  seconds,
  end,
  validateProject,
} from "../src/editor/model.js";
import type { ExportOptions, ExportProgress } from "../src/types/bridge.js";
import { probe } from "./media.js";
import { run } from "./process.js";
export interface RenderPlan {
  args: string[];
  filter: string;
  captions: string;
  duration: number;
  audible: boolean;
  width: number;
  height: number;
  fps: number;
}
const number = (n: number) => Number(n.toFixed(6)).toString();
const time = (n: number) => number(seconds(n));
function tempo(speed: number): string {
  const stages: string[] = [];
  while (speed > 2) {
    stages.push("atempo=2");
    speed /= 2;
  }
  while (speed < 0.5) {
    stages.push("atempo=0.5");
    speed *= 2;
  }
  stages.push(`atempo=${number(speed)}`);
  return stages.join(",");
}
function assTime(n: number): string {
  const cs = Math.round(n / 10000);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
function assText(c: Clip, p: Project, layer: number): string {
  const t = c.text!,
    color = t.color.slice(1).match(/../g)!.reverse().join("");
  const x = Math.round(p.resolution.width / 2 + c.transform.x),
    y = Math.round(p.resolution.height / 2 + c.transform.y);
  const alpha = Math.round((1 - c.opacity) * 255)
    .toString(16)
    .padStart(2, "0");
  const text = t.text
    .replace(/\\/g, "\\​")
    .replace(/{/g, "\uFF5B")
    .replace(/}/g, "\uFF5D")
    .replace(/\r?\n/g, "\\N");
  return `Dialogue: ${layer},${assTime(c.timelineStart)},${assTime(end(c))},${t.background ? "Box" : "Default"},,0,0,0,,{\\an${t.align === "left" ? 4 : t.align === "right" ? 6 : 5}\\pos(${x},${y})\\fn${t.font}\\fs${number(t.size * c.transform.scale)}\\1c&H${color}&\\alpha&H${alpha}&\\bord${t.outline}\\shad${t.shadow}\\frz${-c.transform.rotation}\\fad(${Math.round(c.fadeIn / 1000)},${Math.round(c.fadeOut / 1000)})${t.background ? "\\3c&H111417&\\4c&H111417&\\bord8\\shad0" : ""}}${text}`;
}
export function buildRenderPlan(p: Project): RenderPlan {
  validateProject(p);
  const length = duration(p);
  if (!length) throw new Error("Timeline is empty.");
  const { width, height } = p.resolution,
    fps = p.frameRate;
  const args: string[] = [],
    filters: string[] = [
      `color=c=black:s=${width}x${height}:r=${fps}:d=${time(length)},format=rgba[v0]`,
    ];
  const audioLabels: string[] = [],
    captions: string[] = [];
  let input = 0,
    layer = 0,
    visual = 0;
  for (const track of [...p.tracks].reverse()) {
    layer++;
    for (const c of track.clips) {
      if (c.text) {
        if (track.visible) captions.push(assText(c, p, layer));
        continue;
      }
      const asset = p.mediaAssets.find((a) => a.id === c.mediaAssetId)!;
      const visible = track.type === "video" && track.visible && c.opacity > 0;
      const audible = asset.hasAudio && !track.muted && c.volume > 0;
      if (!visible && !audible) continue;
      if (asset.missing) throw new Error(`Relink missing media: ${asset.name}`);
      if (asset.type === "image")
        args.push(
          "-loop",
          "1",
          "-framerate",
          String(fps),
          "-t",
          time(c.timelineDuration),
          "-i",
          asset.path,
        );
      else
        args.push(
          "-ss",
          time(c.sourceIn),
          "-t",
          time(c.sourceOut - c.sourceIn),
          "-i",
          asset.path,
        );
      if (visible) {
        const ratio =
          Math.min(width / asset.width, height / asset.height) *
          c.transform.scale;
        const w = Math.max(2, Math.round((asset.width * ratio) / 2) * 2),
          h = Math.max(2, Math.round((asset.height * ratio) / 2) * 2);
        const chain = [
          `setpts=(PTS-STARTPTS)/${number(asset.type === "image" ? 1 : c.playbackSpeed)}`,
          `fps=${fps}`,
          `scale=${w}:${h}`,
          "setsar=1",
          "format=rgba",
        ];
        if (c.transform.flipX) chain.push("hflip");
        if (c.transform.flipY) chain.push("vflip");
        if (c.transform.rotation) {
          const angle = number((c.transform.rotation * Math.PI) / 180);
          chain.push(
            `rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=none`,
          );
        }
        chain.push(`colorchannelmixer=aa=${number(c.opacity)}`);
        if (c.fadeIn) chain.push(`fade=t=in:st=0:d=${time(c.fadeIn)}:alpha=1`);
        if (c.fadeOut)
          chain.push(
            `fade=t=out:st=${time(c.timelineDuration - c.fadeOut)}:d=${time(c.fadeOut)}:alpha=1`,
          );
        chain.push(`setpts=PTS+${time(c.timelineStart)}/TB`);
        filters.push(`[${input}:v]${chain.join(",")}[clip${input}]`);
        filters.push(
          `[v${visual}][clip${input}]overlay=x=(W-w)/2+${number(c.transform.x)}:y=(H-h)/2+${number(c.transform.y)}:eof_action=pass:repeatlast=0:enable='gte(t,${time(c.timelineStart)})*lt(t,${time(end(c))})'[v${++visual}]`,
        );
      }
      if (audible) {
        const chain = [
          "asetpts=PTS-STARTPTS",
          tempo(c.playbackSpeed),
          `atrim=duration=${time(c.timelineDuration)}`,
          `volume=${number(c.volume)}`,
        ];
        if (c.fadeIn) chain.push(`afade=t=in:st=0:d=${time(c.fadeIn)}`);
        if (c.fadeOut)
          chain.push(
            `afade=t=out:st=${time(c.timelineDuration - c.fadeOut)}:d=${time(c.fadeOut)}`,
          );
        chain.push(
          "aresample=48000",
          `adelay=${Math.round(seconds(c.timelineStart) * 48000)}S:all=1`,
        );
        filters.push(`[${input}:a]${chain.join(",")}[a${input}]`);
        audioLabels.push(`[a${input}]`);
      }
      input++;
    }
  }
  if (input > 64)
    throw new Error(
      "This renderer supports at most 64 active media clips per export. Split longer projects into sections.",
    );
  filters.push(
    `[v${visual}]${captions.length ? "subtitles=captions.ass," : ""}format=yuv420p[vout]`,
  );
  if (audioLabels.length)
    filters.push(
      `${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=${time(length)}[aout]`,
    );
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00111111,&H80111111,0,0,0,0,100,100,0,0,1,3,1,5,60,60,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const styles = header.replace(
    "\n\n[Events]",
    "\nStyle: Box,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00111417,&H00111417,0,0,0,0,100,100,0,0,3,8,0,5,60,60,40,1\n\n[Events]",
  );
  return {
    args,
    filter: filters.join(";\n"),
    captions: styles + captions.join("\n"),
    duration: length,
    audible: audioLabels.length > 0,
    width,
    height,
    fps,
  };
}
export async function detectNvenc(): Promise<boolean> {
  try {
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=s=640x360:d=0.1",
        "-c:v",
        "h264_nvenc",
        "-f",
        "null",
        "-",
      ],
      { timeout: 15000 },
    );
    return true;
  } catch {
    return false;
  }
}
export async function validateOutput(file: string, plan: RenderPlan) {
  const metadata = await probe(file),
    video = metadata.streams.find((s) => s.codec_type === "video"),
    audio = metadata.streams.find((s) => s.codec_type === "audio");
  const rate = video?.avg_frame_rate?.split("/").map(Number) ?? [0, 1];
  if (
    (await stat(file)).size === 0 ||
    video?.codec_name !== "h264" ||
    video.width !== plan.width ||
    video.height !== plan.height ||
    Math.abs(rate[0] / rate[1] - plan.fps) > 0.01 ||
    Math.abs(Number(metadata.format.duration) - seconds(plan.duration)) >
      Math.max(0.15, 2 / plan.fps) ||
    (plan.audible && audio?.codec_name !== "aac")
  )
    throw new Error(
      "Output validation failed: streams, dimensions, frame rate or duration differ from render plan.",
    );
}
export async function render(
  project: Project,
  destination: string,
  options: ExportOptions,
  signal?: AbortSignal,
  progress: (p: ExportProgress) => void = () => {},
) {
  if (
    !Number.isInteger(options.quality) ||
    options.quality < 16 ||
    options.quality > 32 ||
    ![128, 192, 256, 320].includes(options.audioBitrate) ||
    typeof options.hardware !== "boolean"
  )
    throw new Error("Invalid export settings.");
  const plan = buildRenderPlan(project);
  const work = await mkdtemp(path.join(tmpdir(), "shortcut-render-"));
  const partial = path.join(
    path.dirname(destination),
    `.shortcut-${randomUUID()}.mp4`,
  );
  try {
    await writeFile(path.join(work, "graph.txt"), plan.filter);
    await writeFile(path.join(work, "captions.ass"), plan.captions, "utf8");
    const execute = async (gpu: boolean) => {
      const args = [
        "-hide_banner",
        "-v",
        "warning",
        "-y",
        "-filter_complex_threads",
        "1",
        ...plan.args,
        "-filter_complex_script",
        "graph.txt",
        "-map",
        "[vout]",
      ];
      if (plan.audible)
        args.push(
          "-map",
          "[aout]",
          "-c:a",
          "aac",
          "-b:a",
          `${options.audioBitrate}k`,
        );
      args.push(
        "-c:v",
        gpu ? "h264_nvenc" : "libx264",
        ...(gpu
          ? ["-cq", String(options.quality), "-preset", "p4"]
          : [
              "-crf",
              String(options.quality),
              "-preset",
              "fast",
              "-threads",
              "4",
            ]),
        "-pix_fmt",
        "yuv420p",
        "-t",
        time(plan.duration),
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        partial,
      );
      let lines = "";
      await run("ffmpeg", args, {
        cwd: work,
        signal,
        timeout: 24 * 3600000,
        onStdout(chunk) {
          lines += chunk.toString();
          const complete = lines.split("\n");
          lines = complete.pop()!;
          for (const line of complete)
            if (line.startsWith("out_time_us="))
              progress({
                fraction: Math.min(
                  0.98,
                  Number(line.split("=")[1]) / plan.duration,
                ),
                message: gpu ? "Encoding with NVENC" : "Encoding with CPU",
              });
        },
      });
    };
    const gpu = options.hardware && (await detectNvenc());
    try {
      await execute(gpu);
    } catch (error) {
      if (!gpu || signal?.aborted) throw error;
      progress({ fraction: 0, message: "NVENC failed; retrying with CPU" });
      await execute(false);
    }
    if (signal?.aborted) throw new Error("Operation cancelled.");
    progress({ fraction: 0.99, message: "Validating output" });
    await validateOutput(partial, plan);
    if (signal?.aborted) throw new Error("Operation cancelled.");
    // Publish without replacing an existing file, including a source or a concurrent export.
    await link(partial, destination);
    progress({ fraction: 1, message: "Export complete" });
    return destination;
  } finally {
    await rm(partial, { force: true });
    await rm(work, { recursive: true, force: true });
  }
}
