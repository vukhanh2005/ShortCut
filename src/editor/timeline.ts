import {
  type Clip,
  type Project,
  type Track,
  end,
  uid,
  validateProject,
  quantize,
  newTrack,
  cloneProject,
} from "./model.js";
export type InsertMode = "normal" | "smart" | "overwrite" | "ripple";
export type Edit =
  | {
      type: "insertMany";
      clips: Clip[];
      mode?: InsertMode;
      newTrack?: Track;
      newTracks?: Track[];
    }
  | { type: "insert"; clip: Clip; mode?: InsertMode; newTrack?: Track }
  | { type: "deleteTrack"; trackId: string }
  | { type: "delete"; ids: string[] }
  | { type: "split"; ids: string[]; at: number }
  | {
      type: "move";
      ids: string[];
      delta: number;
      trackId?: string;
      anchorId?: string;
      newTrack?: Track;
      placement?: {
        targetId: string;
        side: "before" | "after";
        ripple?: boolean;
      };
    }
  | { type: "separateAudio"; id: string; linked: boolean }
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
          | "muted"
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
          `Cannot ripple edit: "${clip.name}" spans the edit boundary on "${track.name}". Use normal editing or active-track scope.`,
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
function shiftSequence(
  p: Project,
  track: Track,
  boundary: number,
  delta: number,
  excluded: Set<string>,
) {
  const ids = linkedIds(
    p,
    track.clips
      .filter((c) => !excluded.has(c.id) && c.timelineStart >= boundary)
      .map((c) => c.id),
  );
  for (const id of ids) {
    if (excluded.has(id))
      throw new Error(
        "Insertion would separate a linked group. Move the group to free space.",
      );
    const { clip, track: owner } = locate(p, id);
    unlocked(owner);
    clip.timelineStart += delta;
  }
}
export function placementTarget(
  p: Project,
  trackId: string,
  at: number,
  span: number,
  pointer: number,
  excluded: string[] = [],
) {
  const clips =
    p.tracks
      .find((t) => t.id === trackId)
      ?.clips.filter((c) => !excluded.includes(c.id)) ?? [];
  const target =
    clips.find((c) => pointer >= c.timelineStart && pointer < end(c)) ??
    clips.find((c) => at < end(c) && at + span > c.timelineStart);
  if (!target) return undefined;
  const side =
    pointer < target.timelineStart + target.timelineDuration / 2
      ? ("before" as const)
      : ("after" as const);
  return {
    targetId: target.id,
    side,
    at: side === "before" ? target.timelineStart : end(target),
  };
}
export function editProject(project: Project, command: Edit): Project {
  if (command.type === "insertMany") {
    if (!command.clips.length) throw new Error("Select media to insert.");
    let next = project;
    for (let i = 0; i < command.clips.length; i++)
      next = editProject(next, {
        type: "insert",
        clip: command.clips[i],
        mode: command.mode,
        newTrack: !next.tracks.some((t) => t.id === command.clips[i].trackId)
          ? [command.newTrack, ...(command.newTracks ?? [])].find(
              (t) => t?.id === command.clips[i].trackId,
            )
          : undefined,
      });
    return next;
  }
  const p = cloneProject(project);
  const isRipple = p.settings.ripple;
  if (
    (command.type === "insert" || command.type === "move") &&
    command.newTrack
  ) {
    const track = structuredClone(command.newTrack);
    if (
      track.id !==
      (command.type === "insert" ? command.clip.trackId : command.trackId)
    )
      throw new Error("New track must be the drop destination.");
    if (
      track.clips.length ||
      track.type === "subtitle" ||
      p.tracks.some((t) => t.id === track.id)
    )
      throw new Error("Choose an empty new video or audio track.");
    const index =
      track.type === "video"
        ? p.tracks.findIndex((t) => t.type === "video")
        : p.tracks.map((t) => t.type).lastIndexOf("audio") + 1;
    p.tracks.splice(index < 0 ? 0 : index, 0, track);
  }
  if (command.type === "deleteTrack") {
    const track = p.tracks.find((t) => t.id === command.trackId);
    if (!track) throw new Error("Track no longer exists.");
    unlocked(track);
    if (p.tracks.length === 1)
      throw new Error("Keep at least one timeline track.");
    const groups = new Set(track.clips.map((c) => c.groupId).filter(Boolean));
    p.tracks = p.tracks.filter((t) => t.id !== track.id);
    for (const t of p.tracks)
      for (const c of t.clips) {
        if (c.groupId && groups.has(c.groupId)) {
          unlocked(t);
          delete c.groupId;
        }
      }
  } else if (command.type === "insert") {
    const track = p.tracks.find((t) => t.id === command.clip.trackId);
    if (!track) throw new Error("Select a destination track.");
    unlocked(track);
    const asset = p.mediaAssets.find((a) => a.id === command.clip.mediaAssetId);
    if (
      track.type === "audio" &&
      asset?.type === "video" &&
      !command.clip.audioOnly
    )
      throw new Error(
        "Video belongs on a video track. Use Extract Audio to create an audio clip.",
      );
    if (command.mode === "ripple")
      ripple(
        p,
        track.id,
        command.clip.timelineStart,
        command.clip.timelineDuration,
        new Set(),
      );
    if (command.mode === "smart") {
      if (
        track.clips.some(
          (c) =>
            c.timelineStart < command.clip.timelineStart &&
            end(c) > command.clip.timelineStart,
        )
      )
        throw new Error(
          "Choose before or after the occupied clip for smart insertion.",
        );
      shiftSequence(
        p,
        track,
        command.clip.timelineStart,
        command.clip.timelineDuration,
        new Set(),
      );
    }
    if (command.mode === "overwrite") {
      const start = command.clip.timelineStart,
        stop = end(command.clip);
      track.clips = track.clips.flatMap((c) => {
        if (end(c) <= start || c.timelineStart >= stop) return [c];
        if (c.groupId)
          throw new Error(
            "Unlink overlapping clips before overwrite insertion.",
          );
        const pieces: Clip[] = [];
        if (c.timelineStart < start) {
          const left = structuredClone(c);
          left.timelineDuration = start - c.timelineStart;
          left.sourceOut =
            left.sourceIn +
            Math.round(left.timelineDuration * left.playbackSpeed);
          left.fadeOut = 0;
          clampFades(left);
          pieces.push(left);
        }
        if (end(c) > stop) {
          const right = structuredClone(c);
          if (pieces.length) right.id = uid();
          right.sourceIn += Math.round(
            (stop - c.timelineStart) * c.playbackSpeed,
          );
          right.timelineStart = stop;
          right.timelineDuration = end(c) - stop;
          right.fadeIn = 0;
          clampFades(right);
          pieces.push(right);
        }
        return pieces;
      });
    }
    track.clips.push(structuredClone(command.clip));
  } else if (command.type === "separateAudio") {
    const { clip, track } = locate(p, command.id);
    unlocked(track);
    const asset = p.mediaAssets.find((a) => a.id === clip.mediaAssetId);
    if (
      track.type !== "video" ||
      !asset?.hasAudio ||
      clip.audioEnabled === false
    )
      throw new Error(
        "Select a video with attached audio. Already separated audio can be unlinked.",
      );
    for (const id of linkedIds(p, [clip.id])) unlocked(locate(p, id).track);
    const audioTrack =
      p.tracks.find(
        (t) =>
          t.type === "audio" &&
          !t.locked &&
          t.clips.every(
            (c) => end(c) <= clip.timelineStart || c.timelineStart >= end(clip),
          ),
      ) ?? newTrack("audio", "Extracted audio");
    if (!p.tracks.includes(audioTrack)) p.tracks.push(audioTrack);
    const audio = structuredClone(clip);
    audio.id = uid();
    audio.trackId = audioTrack.id;
    audio.name = `${clip.name} (audio)`;
    audio.audioOnly = true;
    audio.groupId = command.linked ? (clip.groupId ??= uid()) : undefined;
    clip.audioEnabled = false;
    audioTrack.clips.push(audio);
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
      const anchor = locate(p, command.anchorId ?? command.ids[0]);
      if (!ids.has(anchor.clip.id))
        throw new Error("Drag anchor must be selected.");
      const sourceTrackId = anchor.track.id;
      const destination = command.trackId
        ? p.tracks.find((t) => t.id === command.trackId)
        : undefined;
      if (command.trackId && !destination)
        throw new Error("Destination track missing.");
      if (destination) {
        unlocked(destination);
        if (destination.type !== anchor.track.type)
          throw new Error(
            "Invalid drop: move clips to a matching track type. Use Extract Audio to separate sound.",
          );
      }
      let delta = command.delta;
      if (command.placement) {
        if (!destination)
          throw new Error("Choose a destination for sequence insertion.");
        const { clip: target, track: targetTrack } = locate(
          p,
          command.placement.targetId,
        );
        if (targetTrack.id !== destination.id || ids.has(target.id))
          throw new Error("Choose an unselected destination clip.");
        const block = anchor.track.clips.filter((c) => ids.has(c.id));
        const first = Math.min(...block.map((c) => c.timelineStart)),
          last = Math.max(...block.map(end)),
          span = last - first;
        if (
          destination.id === sourceTrackId &&
          !anchor.track.clips.some(
            (c) => !ids.has(c.id) && c.timelineStart < last && end(c) > first,
          )
        )
          shiftSequence(p, destination, last, -span, ids);
        const boundary =
          command.placement.side === "before"
            ? target.timelineStart
            : end(target);
        if (command.placement.ripple)
          ripple(p, destination.id, boundary, span, ids);
        else shiftSequence(p, destination, boundary, span, ids);
        delta = boundary - first;
      }
      for (const id of ids) {
        const { clip, track } = locate(p, id);
        clip.timelineStart += delta;
        if (
          destination &&
          track.id === sourceTrackId &&
          destination.id !== track.id
        ) {
          track.clips = track.clips.filter((c) => c.id !== id);
          clip.trackId = destination.id;
          destination.clips.push(clip);
        }
      }
      if (destination?.type === "video" && destination.id !== sourceTrackId) {
        for (const track of [...p.tracks].filter((t) => t.type === "audio")) {
          const moving = track.clips.filter((c) => ids.has(c.id));
          const others = track.clips.filter((c) => !ids.has(c.id));
          const overlaps = (a: Clip, b: Clip) =>
            a.timelineStart < end(b) && b.timelineStart < end(a);
          if (!moving.some((c) => others.some((other) => overlaps(c, other))))
            continue;
          const target = p.tracks.find(
            (t) =>
              t.type === "audio" &&
              !t.locked &&
              t.id !== track.id &&
              t.muted === track.muted &&
              (t.volume ?? 1) === (track.volume ?? 1) &&
              moving.every((c) =>
                t.clips.every((other) => !overlaps(c, other)),
              ),
          ) ?? {
            ...newTrack("audio", "Linked audio"),
            muted: track.muted,
            volume: track.volume,
          };
          if (!p.tracks.includes(target))
            p.tracks.splice(
              p.tracks.map((t) => t.type).lastIndexOf("audio") + 1,
              0,
              target,
            );
          track.clips = others;
          for (const c of moving) {
            c.trackId = target.id;
            target.clips.push(c);
          }
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
export interface SnapTarget {
  id: string;
  time: number;
  priority: number;
  label: string;
}
export interface SnapResult {
  time: number;
  target?: SnapTarget;
}
export function snapTargets(
  p: Project,
  playhead?: number,
  excluded: string[] = [],
  guides: SnapTarget[] = [],
): SnapTarget[] {
  return [
    { id: "zero", time: 0, priority: 0, label: "Timeline start" },
    ...guides,
    ...(p.markers ?? []).map((marker) => ({
      id: `marker:${marker.id}`,
      time: marker.time,
      priority: 0,
      label: marker.name,
    })),
    ...(playhead === undefined
      ? []
      : [{ id: "playhead", time: playhead, priority: 1, label: "Playhead" }]),
    ...p.tracks.flatMap((t) =>
      t.clips
        .filter((c) => !excluded.includes(c.id))
        .flatMap((c) => [
          {
            id: `${c.id}:start`,
            time: c.timelineStart,
            priority: 2,
            label: `${c.name} start`,
          },
          {
            id: `${c.id}:end`,
            time: end(c),
            priority: 2,
            label: `${c.name} end`,
          },
        ]),
    ),
  ];
}
export function resolveSnap(
  p: Project,
  time: number,
  zoom: number,
  targets: SnapTarget[],
  previous?: SnapTarget,
  offsets = [0],
): SnapResult {
  const value = Math.max(0, quantize(p, time));
  if (!p.settings.snapping) return { time: value };
  const candidates = targets.flatMap((target) =>
    offsets.map((offset) => ({
      target,
      time: target.time - offset,
      distance: (Math.abs(target.time - offset - time) * zoom) / 1_000_000,
    })),
  );
  const held = candidates
    .filter(
      (c) => c.target.id === previous?.id && c.time >= 0 && c.distance <= 13,
    )
    .sort((a, b) => a.distance - b.distance)[0];
  const best =
    held ??
    candidates
      .filter((c) => c.time >= 0 && c.distance <= 10)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.target.priority - b.target.priority ||
          a.target.time - b.target.time ||
          a.target.id.localeCompare(b.target.id),
      )[0];
  return best ? { time: best.time, target: best.target } : { time: value };
}
export function snap(
  p: Project,
  time: number,
  playhead: number,
  excluded: string[],
  threshold: number,
): number {
  return resolveSnap(
    p,
    time,
    10_000_000 / threshold,
    snapTargets(p, playhead, excluded),
  ).time;
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
