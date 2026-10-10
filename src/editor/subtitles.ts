import { type Clip, type Project, newClip, SECOND } from "./model.js";
function parseTime(s: string): number {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(s);
  if (!match || +match[2] > 59 || +match[3] > 59)
    throw new Error(`Invalid SRT timestamp: ${s}`);
  return (
    ((+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000 + +match[4]) * 1000
  );
}
export function importSrt(
  text: string,
  trackId: string,
  project: Project,
): Clip[] {
  if (text.length > 2_000_000) throw new Error("SRT exceeds 2 MB.");
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      if (/^\d+$/.test(lines[0])) lines.shift();
      const range = lines.shift()?.split(/\s+-->\s+/);
      if (!range || range.length !== 2)
        throw new Error("SRT block is missing its time range.");
      const start = parseTime(range[0]),
        stop = parseTime(range[1]);
      if (stop <= start) throw new Error("Subtitle end must follow start.");
      const c = newClip(trackId, undefined, start);
      c.timelineDuration = stop - start;
      c.sourceOut = c.timelineDuration;
      c.transform.y = project.resolution.height * 0.34;
      c.text!.size = Math.round(project.resolution.width * 0.06);
      c.text!.text = lines.join("\n").replace(/<[^>]*>/g, "");
      c.name = c.text!.text;
      return c;
    });
}
function timestamp(t: number): string {
  const ms = Math.round(t / 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function exportSrt(p: Project): string {
  return p.tracks
    .filter((t) => t.type === "subtitle")
    .flatMap((t) => t.clips)
    .sort((a, b) => a.timelineStart - b.timelineStart)
    .map(
      (c, i) =>
        `${i + 1}\n${timestamp(c.timelineStart)} --> ${timestamp(c.timelineStart + c.timelineDuration)}\n${c.text?.text ?? ""}\n`,
    )
    .join("\n");
}
