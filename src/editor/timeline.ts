import {
  type Clip,
  type Project,
  type Track,
  end,
  uid,
  validateProject,
  quantize,
} from "./model.js";
export type Edit =
  | { type: "insert"; clip: Clip }
  | { type: "delete"; ids: string[] }
  | { type: "split"; ids: string[]; at: number }
  | { type: "move"; ids: string[]; delta: number; trackId?: string }
  | { type: "trim"; id: string; edge: "start" | "end"; at: number }
  | { type: "speed"; id: string; speed: number }
  | {
      type: "patch";
      ids: string[];
      patch: Partial<
        Pick<
          Clip,
          | "name"
          | "transform"
          | "opacity"
          | "volume"
          | "fadeIn"
          | "fadeOut"
          | "text"
        >
      >;
    }
  | { type: "link"; ids: string[]; unlink?: boolean };
export function linkedIds(p: Project, ids: string[]): Set<string> {
  const all = p.tracks.flatMap((t) => t.clips);
  const groups = new Set(
    all.filter((c) => ids.includes(c.id) && c.groupId).map((c) => c.groupId),
  );
  return new Set(
    all
      .filter((c) => ids.includes(c.id) || (c.groupId && groups.has(c.groupId)))
      .map((c) => c.id),
  );
}
function locate(p: Project, id: string): { clip: Clip; track: Track } {
  for (const track of p.tracks) {
    const clip = track.clips.find((c) => c.id === id);
    if (clip) return { track, clip };
  }
  throw new Error("Clip no longer exists.");
}
function unlocked(track: Track) {
  if (track.locked)
    throw new Error(`Unlock "${track.name}" before editing it.`);
}
function ripple(
  p: Project,
  active: string,
  boundary: number,
  delta: number,
  exempt: Set<string>,
  removedFrom = boundary,
) {
  if (!delta) return;
  for (const track of p.tracks) {
    if (p.settings.rippleScope === "track" && track.id !== active) continue;
    for (const clip of track.clips) {
      if (exempt.has(clip.id) || end(clip) <= removedFrom) continue;
      if (clip.timelineStart < boundary)
        throw new Error(
          `"${clip.name}" spans the ripple boundary. Split it, or use active-track scope.`,
        );
      unlocked(track);
      clip.timelineStart += delta;
    }
  }
}
function clampFades(c: Clip) {
  c.fadeIn = Math.min(c.fadeIn, c.timelineDuration);
  c.fadeOut = Math.min(c.fadeOut, c.timelineDuration - c.fadeIn);
}
export function editProject(project: Project, command: Edit): Project {
  const p = structuredClone(project);
  const isRipple = p.settings.ripple;
  if (command.type === "insert") {
    const track = p.tracks.find((t) => t.id === command.clip.trackId);
    if (!track) throw new Error("Select a destination track.");
    unlocked(track);
    if (isRipple)
      ripple(
        p,
        track.id,
        command.clip.timelineStart,
        command.clip.timelineDuration,
        new Set(),
      );
    track.clips.push(structuredClone(command.clip));
  } else if (command.type === "trim" || command.type === "speed") {
    const selected = linkedIds(p, [command.id]);
    const primary = locate(p, command.id).clip;
    const oldEnd = end(primary);
    let change: number;
    if (command.type === "speed") {
      if (
        !Number.isFinite(command.speed) ||
        command.speed < 0.25 ||
        command.speed > 4
      )
        throw new Error("Speed must be 0.25..4.");
      change =
        Math.round((primary.sourceOut - primary.sourceIn) / command.speed) -
        primary.timelineDuration;
    } else
      change =
        command.edge === "end"
          ? command.at - oldEnd
          : primary.timelineStart - command.at;
    for (const id of selected) {
      const { clip, track } = locate(p, id);
      unlocked(track);
      if (command.type === "speed") clip.playbackSpeed = command.speed;
      else if (command.edge === "start") {
        clip.sourceIn -= Math.round(change * clip.playbackSpeed);
        if (!isRipple) clip.timelineStart -= change;
      }
      clip.timelineDuration += change;
      clip.sourceOut =
        clip.sourceIn + Math.round(clip.timelineDuration * clip.playbackSpeed);
      clampFades(clip);
    }
    if (isRipple)
      ripple(
        p,
        primary.trackId,
        oldEnd,
        change,
        selected,
        Math.min(oldEnd, oldEnd + change),
      );
  } else {
    const ids = linkedIds(p, command.ids);
    if (!ids.size) throw new Error("Select a clip first.");
    for (const id of ids) unlocked(locate(p, id).track);
    if (command.type === "delete") {
      const removed = [...ids].map((id) => locate(p, id).clip);
      for (const t of p.tracks) t.clips = t.clips.filter((c) => !ids.has(c.id));
      if (isRipple) {
        const intervals = removed
          .map((c) => ({
            start: c.timelineStart,
            end: end(c),
            trackId: c.trackId,
          }))
          .sort((a, b) => a.start - b.start);
        const merged: typeof intervals = [];
        for (const interval of intervals) {
          const last = merged.at(-1);
          if (last && interval.start <= last.end)
            last.end = Math.max(last.end, interval.end);
          else merged.push({ ...interval });
        }
        if (
          p.settings.rippleScope === "track" &&
          new Set(removed.map((c) => c.trackId)).size > 1
        )
          throw new Error("Multi-track ripple delete needs all-track scope.");
        for (const interval of merged.reverse())
          ripple(
            p,
            interval.trackId,
            interval.end,
            interval.start - interval.end,
            ids,
            interval.start,
          );
      }
    } else if (command.type === "split") {
      const splitGroups = new Map<string, string>();
      let splits = 0;
      for (const id of ids) {
        const { clip, track } = locate(p, id);
        if (command.at <= clip.timelineStart || command.at >= end(clip))
          continue;
        const right = structuredClone(clip);
        right.id = uid();
        right.timelineStart = command.at;
        right.timelineDuration = end(clip) - command.at;
        right.sourceIn =
          clip.sourceIn +
          Math.round((command.at - clip.timelineStart) * clip.playbackSpeed);
        clip.timelineDuration = command.at - clip.timelineStart;
        clip.sourceOut = right.sourceIn;
        if (clip.groupId) {
          if (!splitGroups.has(clip.groupId))
            splitGroups.set(clip.groupId, uid());
          right.groupId = splitGroups.get(clip.groupId);
        }
        clip.fadeOut = 0;
        right.fadeIn = 0;
        clampFades(clip);
        clampFades(right);
        track.clips.push(right);
        splits++;
      }
      if (!splits)
        throw new Error("Place playhead inside selected clip to split.");
    } else if (command.type === "move") {
      if (command.trackId && ids.size > 1)
        throw new Error(
          "Move linked or selected clips within their tracks; unlink to change tracks.",
        );
      for (const id of ids) {
        const { clip, track } = locate(p, id);
        clip.timelineStart += command.delta;
        if (command.trackId && command.trackId !== track.id) {
          const destination = p.tracks.find((t) => t.id === command.trackId);
          if (!destination) throw new Error("Destination track missing.");
          unlocked(destination);
          track.clips = track.clips.filter((c) => c.id !== id);
          clip.trackId = destination.id;
          destination.clips.push(clip);
        }
      }
    } else if (command.type === "patch") {
      for (const id of command.ids)
        Object.assign(locate(p, id).clip, structuredClone(command.patch));
    } else if (command.type === "link") {
      const group = command.unlink ? undefined : uid();
      if (!command.unlink && ids.size < 2)
        throw new Error("Select at least two synchronized clips to link.");
      for (const id of ids) locate(p, id).clip.groupId = group;
    }
  }
  for (const track of p.tracks)
    track.clips.sort((a, b) => a.timelineStart - b.timelineStart);
  validateProject(p);
  return p;
}
export function snap(
  p: Project,
  time: number,
  playhead: number,
  excluded: string[],
  threshold: number,
): number {
  const value = Math.max(0, quantize(p, time));
  if (!p.settings.snapping) return value;
  const candidates = [
    0,
    playhead,
    ...p.tracks.flatMap((t) =>
      t.clips
        .filter((c) => !excluded.includes(c.id))
        .flatMap((c) => [c.timelineStart, end(c)]),
    ),
  ];
  const closest = candidates.reduce(
    (a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a),
    candidates[0],
  );
  return Math.abs(closest - value) <= threshold ? closest : value;
}
export function fadeAt(c: Clip, localTime: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      c.fadeIn ? localTime / c.fadeIn : 1,
      c.fadeOut ? (c.timelineDuration - localTime) / c.fadeOut : 1,
    ),
  );
}
