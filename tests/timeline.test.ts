import { describe, expect, test, beforeEach } from "vitest";
import {
  type Project,
  type MediaAsset,
  newProject,
  newClip,
  newTrack,
  SECOND as S,
  validateProject,
  parseProject,
  serializeProject,
  frame,
  seekFrame,
  uid,
} from "../src/editor/model.js";
import {
  editProject,
  snap,
  resolveSnap,
  snapTargets,
  placementTarget,
} from "../src/editor/timeline.js";
import { useEditor, effectiveProject } from "../src/stores/editor.js";
import { importSrt, exportSrt } from "../src/editor/subtitles.js";
const asset: MediaAsset = {
  id: "asset",
  path: "D:\\media\\clip.mp4",
  name: "clip.mp4",
  type: "video",
  duration: 60 * S,
  width: 1920,
  height: 1080,
  frameRate: 30,
  hasAudio: true,
  size: 123,
  folder: "",
  favorite: false,
};
function fixture(): Project {
  const p = newProject();
  p.settings.ripple = true;
  p.mediaAssets = [asset];
  p.tracks[1].clips = [
    [0, 5],
    [5, 4],
    [9, 5],
  ].map(([start, length], i) => ({
    ...newClip(p.tracks[1].id, asset, start * S),
    id: ["A", "B", "C"][i],
    timelineDuration: length * S,
    sourceOut: length * S,
  }));
  return p;
}
const positions = (p: Project, track = 1) =>
  p.tracks[track].clips.map((c) => [
    c.id,
    c.timelineStart / S,
    c.timelineDuration / S,
  ]);
test("interactive edits share effective state, preserve persistent data and commit one history item", () => {
  const p = fixture();
  useEditor.getState().load(p);
  const s = useEditor.getState();
  s.beginInteractive("position");
  for (const x of [1, 20, 50])
    s.updateInteractive((draft) => {
      draft.tracks[1].clips[0].transform.x = x;
    });
  expect(useEditor.getState().project).toBe(p);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(
    effectiveProject(useEditor.getState()).tracks[1].clips[0].transform.x,
  ).toBe(50);
  s.commitInteractive();
  expect(useEditor.getState().past).toHaveLength(1);
  s.undo();
  expect(useEditor.getState().project).toEqual(p);
  s.redo();
  expect(useEditor.getState().project.tracks[1].clips[0].transform.x).toBe(50);
  s.beginInteractive("invalid");
  expect(
    s.updateInteractive((draft) => {
      draft.tracks[1].clips[0].transform.scale = -1;
    }),
  ).toBe(false);
  expect(
    effectiveProject(useEditor.getState()).tracks[1].clips[0].transform.scale,
  ).toBe(1);
  s.cancelInteractive();
  expect(useEditor.getState().past).toHaveLength(1);
  s.beginInteractive("cancel");
  s.updateInteractive((draft) => {
    draft.tracks[1].clips[0].transform.x = 100;
  });
  s.undo();
  expect(
    effectiveProject(useEditor.getState()).tracks[1].clips[0].transform.x,
  ).toBe(50);
});
test.each(["before", "after"] as const)(
  "smart cross-track insertion %s shifts only destination and linked partners",
  (side) => {
    let p = editProject(fixture(), {
      type: "separateAudio",
      id: "B",
      linked: true,
    });
    const upper = newTrack("video", "Upper"),
      incoming = {
        ...newClip(upper.id, asset, 20 * S),
        timelineDuration: 2 * S,
        sourceIn: 3 * S,
        sourceOut: 5 * S,
      };
    upper.clips = [incoming];
    p.tracks.unshift(upper);
    p.tracks[1].clips.push(newClip(p.tracks[1].id, undefined, 6 * S));
    const destination = p.tracks[2],
      at = side === "before" ? 5 * S : 9 * S;
    const target = placementTarget(
      p,
      destination.id,
      at,
      2 * S,
      side === "before" ? 6 * S : 8 * S,
      [incoming.id],
    )!;
    expect(target.side).toBe(side);
    const command = {
      type: "move" as const,
      ids: [incoming.id],
      delta: at - incoming.timelineStart,
      trackId: destination.id,
      placement: target,
    };
    useEditor.getState().load(p);
    expect(useEditor.getState().edit(command)).toBe(true);
    const result = useEditor.getState().project;
    expect(
      result.tracks[2].clips.find((c) => c.id === incoming.id),
    ).toMatchObject({ timelineStart: at, sourceIn: 3 * S, sourceOut: 5 * S });
    expect(
      result.tracks[2].clips.find((c) => c.id === "B")!.timelineStart,
    ).toBe((side === "before" ? 7 : 5) * S);
    expect(result.tracks[3].clips[0].timelineStart).toBe(
      (side === "before" ? 7 : 5) * S,
    );
    expect(result.tracks[1]).toEqual(p.tracks[1]);
    expect(parseProject(serializeProject(result))).toEqual(result);
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(p);
    useEditor.getState().redo();
    expect(useEditor.getState().project).toEqual(result);
    p.tracks[3].locked = true;
    if (side === "before")
      expect(() => editProject(p, command)).toThrow("Unlock");
  },
);
test("same-track reorder closes contiguous source block and preserves multiselection offsets", () => {
  const p = fixture();
  const result = editProject(p, {
    type: "move",
    ids: ["A"],
    delta: 9 * S,
    trackId: p.tracks[1].id,
    placement: { targetId: "B", side: "after" },
  });
  expect(positions(result)).toEqual([
    ["B", 0, 4],
    ["A", 4, 5],
    ["C", 9, 5],
  ]);
  const grouped = editProject(p, {
    type: "move",
    ids: ["A", "B"],
    delta: 14 * S,
    trackId: p.tracks[1].id,
    placement: { targetId: "C", side: "after" },
  });
  expect(positions(grouped)).toEqual([
    ["C", 0, 5],
    ["A", 5, 5],
    ["B", 10, 4],
  ]);
  const restored = editProject(grouped, {
    type: "move",
    ids: ["A", "B"],
    delta: -5 * S,
    trackId: p.tracks[1].id,
    placement: { targetId: "C", side: "before" },
  });
  expect(positions(restored)).toEqual(positions(p));
});
test("ordered multi-asset insert is atomic and does not move content in free gaps", () => {
  const p = fixture(),
    track = newTrack("video", "Batch");
  const clips = [0, 2].map((at) => ({
    ...newClip(track.id, asset, at * S),
    timelineDuration: 2 * S,
    sourceOut: 2 * S,
  }));
  useEditor.getState().load(p);
  expect(
    useEditor
      .getState()
      .edit({ type: "insertMany", clips, newTrack: track, mode: "normal" }),
  ).toBe(true);
  expect(useEditor.getState().past).toHaveLength(1);
  expect(
    useEditor.getState().project.tracks.find((t) => t.id === p.tracks[1].id),
  ).toEqual(p.tracks[1]);
  useEditor.getState().undo();
  expect(useEditor.getState().project).toEqual(p);
  clips[1].sourceOut = -1;
  expect(
    useEditor.getState().edit({ type: "insertMany", clips, newTrack: track }),
  ).toBe(false);
  expect(useEditor.getState().project).toEqual(p);
});
test("normal asset reuse bypasses ripple; explicit ripple retains boundary protection", () => {
  const p = newProject();
  p.settings.ripple = true;
  const video = { ...asset, duration: S },
    audio = { ...asset, id: "sound", type: "audio" as const, duration: S };
  p.mediaAssets = [video, audio];
  p.tracks[0].clips.push(newClip(p.tracks[0].id));
  useEditor.getState().load(p);
  for (const a of [video, audio])
    for (const at of [S, 2 * S, 3 * S])
      useEditor.getState().addAsset(a, undefined, at);
  const result = useEditor.getState().project;
  expect(result.tracks[0]).toEqual(p.tracks[0]);
  const clips = result.tracks.slice(1).flatMap((t) => t.clips);
  expect(clips).toHaveLength(6);
  expect(new Set(clips.map((c) => c.id)).size).toBe(6);
  expect(() =>
    editProject(p, {
      type: "insert",
      clip: newClip(p.tracks[1].id, video, S),
      mode: "ripple",
    }),
  ).toThrow("boundary");
  expect(() =>
    editProject(result, {
      type: "insert",
      clip: newClip(p.tracks[1].id, video, S),
    }),
  ).toThrow("overlap");
});
test("overwrite preserves source tails and never shifts captions or linked media", () => {
  const p = fixture();
  p.tracks[0].clips.push(newClip(p.tracks[0].id));
  const clip = {
    ...newClip(p.tracks[1].id, asset, S),
    timelineDuration: S,
    sourceOut: S,
  };
  const result = editProject(p, { type: "insert", clip, mode: "overwrite" });
  expect(
    result.tracks[1].clips
      .slice(0, 3)
      .map((c) => [
        c.timelineStart,
        c.timelineDuration,
        c.sourceIn,
        c.sourceOut,
      ]),
  ).toEqual([
    [0, S, 0, S],
    [S, S, 0, S],
    [2 * S, 3 * S, 2 * S, 5 * S],
  ]);
  expect(result.tracks[0]).toEqual(p.tracks[0]);
  p.tracks[1].clips[0].groupId = "pair";
  expect(() =>
    editProject(p, { type: "insert", clip, mode: "overwrite" }),
  ).toThrow("Unlink");
});
test.each(["video", "audio"] as const)(
  "delete %s track preserves captions, timing, history and persistence",
  (kind) => {
    const p = fixture(),
      track = p.tracks.find((t) => t.type === kind)!;
    p.tracks[0].clips.push(newClip(p.tracks[0].id));
    const paired = editProject(p, {
      type: "separateAudio",
      id: "B",
      linked: true,
    });
    useEditor.getState().load(paired);
    const s = useEditor.getState();
    expect(s.edit({ type: "deleteTrack", trackId: track.id })).toBe(true);
    const result = useEditor.getState().project;
    expect(result.tracks[0]).toEqual(paired.tracks[0]);
    for (const t of result.tracks)
      for (const c of t.clips) {
        const old = paired.tracks
          .flatMap((t) => t.clips)
          .find((v) => v.id === c.id)!;
        expect(c.timelineStart).toBe(old.timelineStart);
        if (old.groupId) expect(c.groupId).toBeUndefined();
      }
    expect(parseProject(serializeProject(result))).toEqual(result);
    s.undo();
    expect(useEditor.getState().project).toEqual(paired);
    s.redo();
    expect(useEditor.getState().project).toEqual(result);
    paired.tracks.find((t) => t.id === track.id)!.locked = true;
    expect(() =>
      editProject(paired, { type: "deleteTrack", trackId: track.id }),
    ).toThrow("Unlock");
    const empty = newProject();
    expect(
      editProject(empty, {
        type: "deleteTrack",
        trackId: empty.tracks.find((t) => t.type === kind)!.id,
      }).tracks,
    ).toHaveLength(2);
  },
);
describe("transactional ripple editing", () => {
  test("1. delete middle closes interval", () => {
    expect(
      positions(editProject(fixture(), { type: "delete", ids: ["B"] })),
    ).toEqual([
      ["A", 0, 5],
      ["C", 5, 5],
    ]);
  });
  test("2. insert moves downstream clips", () => {
    const p = fixture(),
      c = {
        ...newClip(p.tracks[1].id, asset, 5 * S),
        id: "X",
        timelineDuration: 3 * S,
        sourceOut: 3 * S,
      };
    expect(
      positions(editProject(p, { type: "insert", clip: c, mode: "ripple" })),
    ).toEqual([
      ["A", 0, 5],
      ["X", 5, 3],
      ["B", 8, 4],
      ["C", 12, 5],
    ]);
  });
  test("3. extend shifts followers", () => {
    expect(
      positions(
        editProject(fixture(), {
          type: "trim",
          id: "A",
          edge: "end",
          at: 7 * S,
        }),
      ),
    ).toEqual([
      ["A", 0, 7],
      ["B", 7, 4],
      ["C", 11, 5],
    ]);
  });
  test("4. shorten shifts followers back", () => {
    expect(
      positions(
        editProject(fixture(), {
          type: "trim",
          id: "A",
          edge: "end",
          at: 3 * S,
        }),
      ),
    ).toEqual([
      ["A", 0, 3],
      ["B", 3, 4],
      ["C", 7, 5],
    ]);
  });
  test("5. multiple audio tracks follow", () => {
    const p = fixture();
    for (let i = 0; i < 2; i++) {
      const t = newTrack("audio", `Audio ${i}`);
      t.clips = [
        { ...newClip(t.id, asset, 9 * S), timelineDuration: S, sourceOut: S },
      ];
      p.tracks.push(t);
    }
    const result = editProject(p, { type: "delete", ids: ["B"] });
    expect(
      result.tracks.slice(-2).map((t) => t.clips[0].timelineStart),
    ).toEqual([5 * S, 5 * S]);
  });
  test("6. locked downstream track rejects entire edit", () => {
    const p = fixture(),
      t = p.tracks[2];
    t.locked = true;
    t.clips = [
      { ...newClip(t.id, asset, 10 * S), timelineDuration: S, sourceOut: S },
    ];
    const before = structuredClone(p);
    expect(() => editProject(p, { type: "delete", ids: ["B"] })).toThrow(
      "Unlock",
    );
    expect(p).toEqual(before);
  });
  test("7. source ranges preserved on shift and split", () => {
    const p = fixture();
    p.tracks[1].clips[2].sourceIn = 8 * S;
    p.tracks[1].clips[2].sourceOut = 13 * S;
    const r = editProject(p, { type: "delete", ids: ["B"] });
    expect(r.tracks[1].clips[1].sourceIn).toBe(8 * S);
    const split = editProject(r, { type: "split", ids: ["C"], at: 7 * S });
    expect(
      split.tracks[1].clips.slice(1).map((c) => [c.sourceIn, c.sourceOut]),
    ).toEqual([
      [8 * S, 10 * S],
      [10 * S, 13 * S],
    ]);
  });
  test("8. undo ripple delete restores selection and timeline", () => {
    const p = fixture();
    useEditor.getState().load(p);
    useEditor.getState().select("B");
    useEditor.getState().edit({ type: "delete", ids: ["B"] });
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(p);
    expect(useEditor.getState().selection).toEqual(["B"]);
  });
  test("9. redo insert restores data", () => {
    const p = fixture();
    useEditor.getState().load(p);
    const c = {
      ...newClip(p.tracks[1].id, asset, 5 * S),
      timelineDuration: S,
      sourceOut: S,
    };
    useEditor.getState().edit({ type: "insert", clip: c, mode: "ripple" });
    const after = structuredClone(useEditor.getState().project);
    useEditor.getState().undo();
    useEditor.getState().redo();
    expect(useEditor.getState().project).toEqual(after);
  });
  test("10. timeline zero remains valid", () => {
    const r = editProject(fixture(), { type: "delete", ids: ["A"] });
    expect(r.tracks[1].clips[0].timelineStart).toBe(0);
    expect(() =>
      editProject(r, { type: "move", ids: ["B"], delta: -1 }),
    ).toThrow("start");
  });
  test("11. spanning boundary rejects; active-track scope succeeds", () => {
    const p = fixture(),
      t = p.tracks[2];
    t.clips = [
      { ...newClip(t.id, asset), timelineDuration: 20 * S, sourceOut: 20 * S },
    ];
    expect(() => editProject(p, { type: "delete", ids: ["B"] })).toThrow(
      "spans",
    );
    p.settings.rippleScope = "track";
    expect(
      editProject(p, { type: "delete", ids: ["B"] }).tracks[2].clips[0]
        .timelineDuration,
    ).toBe(20 * S);
  });
  test("12. linked video and audio split and move together", () => {
    const p = fixture(),
      c = structuredClone(p.tracks[1].clips[1]);
    c.id = "audioB";
    c.trackId = p.tracks[2].id;
    c.groupId = "linked";
    p.tracks[1].clips[1].groupId = "linked";
    p.tracks[2].clips.push(c);
    const r = editProject(p, { type: "split", ids: ["B"], at: 7 * S });
    expect(r.tracks[2].clips.map((c) => c.timelineDuration)).toEqual([
      2 * S,
      2 * S,
    ]);
    expect(r.tracks[1].clips[2].groupId).toBe(r.tracks[2].clips[1].groupId);
  });
  test("13. subtitle and sound effect synchronize", () => {
    const p = fixture(),
      caption = newClip(p.tracks[0].id, undefined, 9 * S);
    p.tracks[0].clips.push(caption);
    p.tracks[2].clips.push({
      ...newClip(p.tracks[2].id, asset, 9 * S),
      timelineDuration: S,
      sourceOut: S,
    });
    const r = editProject(p, { type: "delete", ids: ["B"] });
    expect([
      r.tracks[0].clips[0].timelineStart,
      r.tracks[2].clips[0].timelineStart,
    ]).toEqual([5 * S, 5 * S]);
  });
  test("14. unsupported overlap rejected atomically", () => {
    const p = fixture();
    p.settings.ripple = false;
    expect(() =>
      editProject(p, { type: "move", ids: ["C"], delta: -S }),
    ).toThrow("overlap");
    expect(positions(p)[2]).toEqual(["C", 9, 5]);
  });
  test("15. consecutive ripple edits remain valid", () => {
    let p = fixture();
    p = editProject(p, { type: "trim", id: "A", edge: "end", at: 3 * S });
    p = editProject(p, { type: "delete", ids: ["B"] });
    p = editProject(p, { type: "trim", id: "C", edge: "start", at: 4 * S });
    expect(positions(p)).toEqual([
      ["A", 0, 3],
      ["C", 3, 4],
    ]);
    expect(p.tracks[1].clips[1].sourceIn).toBe(S);
    validateProject(p);
  });
});
test("speed preserves source interval and moves downstream content", () => {
  const r = editProject(fixture(), { type: "speed", id: "A", speed: 2 });
  expect(r.tracks[1].clips[0].sourceOut).toBe(5 * S);
  expect(r.tracks[1].clips[1].timelineStart).toBe(2.5 * S);
});
test("snapping and rational frame conversion avoid accumulation", () => {
  const p = fixture();
  expect(frame(p, 108000)).toBe(3600 * S);
  expect(snap(p, 5 * S + 10000, 0, [], 50000)).toBe(5 * S);
});
test("snap engine uses screen distance, both edges, stable targets and release hysteresis", () => {
  const p = fixture(),
    targets = snapTargets(p);
  for (const zoom of [20, 80, 240]) {
    const result = resolveSnap(p, 5 * S + (9 * S) / zoom, zoom, targets);
    expect(result.time).toBe(5 * S);
    expect(
      resolveSnap(p, 5 * S + (12 * S) / zoom, zoom, targets, result.target)
        .target?.id,
    ).toBe(result.target?.id);
    expect(
      resolveSnap(p, 5 * S + (14 * S) / zoom, zoom, targets, result.target)
        .target,
    ).toBeUndefined();
    expect(
      resolveSnap(p, 4 * S + (4 * S) / zoom, zoom, targets, undefined, [0, S])
        .time,
    ).toBe(4 * S);
  }
  const guide = { id: "marker", time: 5 * S, priority: 0, label: "Marker" };
  expect(resolveSnap(p, 5 * S, 80, [...targets, guide]).target?.id).toBe(
    "marker",
  );
  expect(resolveSnap(p, 5 * S, 80, [...targets].reverse()).target?.id).toBe(
    resolveSnap(p, 5 * S, 80, targets).target?.id,
  );
  expect(resolveSnap(p, 9 * S + 1000, 80, targets).time).toBe(9 * S);
  p.markers = [{ id: "saved-marker", time: 2 * S, name: "Beat" }];
  expect(
    resolveSnap(
      p,
      2 * S + 1000,
      80,
      snapTargets(parseProject(serializeProject(p))),
    ),
  ).toMatchObject({ time: 2 * S, target: { id: "marker:saved-marker" } });
  p.settings.snapping = false;
  expect(resolveSnap(p, 5 * S + S / 30, 80, targets).target).toBeUndefined();
  expect(resolveSnap(p, 5 * S + S / 30, 80, targets).time).toBe(frame(p, 151));
});
test("new-track move commits atomically, preserves split audio, and restores in one undo", () => {
  let p = editProject(fixture(), {
    type: "separateAudio",
    id: "B",
    linked: true,
  });
  p = editProject(p, { type: "split", ids: ["B"], at: 7 * S });
  const segment = p.tracks[1].clips.find((c) => c.timelineStart === 7 * S)!;
  p.tracks[2].volume = 0.5;
  p.tracks[2].muted = true;
  const upper = newTrack("video", "Upper");
  useEditor.getState().load(p);
  expect(
    useEditor.getState().edit({
      type: "move",
      ids: [segment.id],
      anchorId: segment.id,
      delta: -S,
      trackId: upper.id,
      newTrack: upper,
    }),
  ).toBe(true);
  const result = useEditor.getState().project;
  expect(result.tracks.find((t) => t.name === "Linked audio")).toMatchObject({
    volume: 0.5,
    muted: true,
  });
  expect(result.tracks.find((t) => t.id === upper.id)!.clips[0].sourceIn).toBe(
    2 * S,
  );
  expect(
    result.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.groupId === segment.groupId)
      .map((c) => c.timelineStart),
  ).toEqual([6 * S, 6 * S]);
  useEditor.getState().undo();
  expect(useEditor.getState().project).toEqual(p);
  useEditor.getState().redo();
  expect(useEditor.getState().project).toEqual(result);
  const wrong = newTrack("audio", "Wrong");
  expect(() =>
    editProject(p, {
      type: "move",
      ids: [segment.id],
      delta: 0,
      trackId: wrong.id,
      newTrack: wrong,
    }),
  ).toThrow("matching");
  expect(p.tracks.some((t) => t.id === wrong.id)).toBe(false);
});
test("track deletion rejects locked surviving partners and failed auto-tracks leave history untouched", () => {
  const p = editProject(fixture(), {
    type: "separateAudio",
    id: "B",
    linked: true,
  });
  p.tracks[2].locked = true;
  useEditor.getState().load(p);
  expect(
    useEditor.getState().edit({ type: "deleteTrack", trackId: p.tracks[1].id }),
  ).toBe(false);
  expect(useEditor.getState().project).toBe(p);
  const track = newTrack("video", "New layer");
  expect(
    useEditor.getState().edit({
      type: "move",
      ids: ["B"],
      delta: 0,
      trackId: track.id,
      newTrack: track,
    }),
  ).toBe(false);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().project.tracks).toHaveLength(3);
});
test("versioned serialization removes ephemeral paths", () => {
  const p = fixture();
  p.mediaAssets[0] = { ...asset, url: "media://local/temp" };
  const text = serializeProject(p);
  expect(text).not.toContain("media://");
  expect(parseProject(text).tracks).toEqual(p.tracks);
  expect(() =>
    parseProject(text.replace('"schemaVersion": 1', '"schemaVersion": 9')),
  ).toThrow("version");
});
test("Unicode SRT round trip", () => {
  const p = newProject();
  p.tracks[0].clips = importSrt(
    "1\n00:00:01,250 --> 00:00:03,500\nXin chào Việt Nam\n",
    p.tracks[0].id,
    p,
  );
  validateProject(p);
  expect(exportSrt(p)).toContain("Xin chào Việt Nam");
  expect(p.tracks[0].clips[0].timelineDuration).toBe(2.25 * S);
});
test("malformed and unsafe input rejects at project boundary", () => {
  const p = fixture();
  p.tracks[1].clips[0].transform.scale = NaN;
  expect(() => validateProject(p)).toThrow("scale");
  expect(() => validateProject({ schemaVersion: 1 })).toThrow();
});
test("unsupported transition and keyframe data is rejected instead of silently ignored", () => {
  expect(() => validateProject({ ...fixture(), transitions: [] })).toThrow(
    "Transition",
  );
  const p = fixture();
  Object.assign(p.tracks[1].clips[0], { keyframes: [] });
  expect(() => validateProject(p)).toThrow("Unsupported effect");
});

describe("frame seeking and layer transfers", () => {
  test("extracted audio duplicates and separation/layer moves undo and redo", () => {
    const p = fixture(),
      upper = newTrack("video", "Upper");
    p.tracks.unshift(upper);
    useEditor.getState().load(p);
    const state = useEditor.getState();
    expect(state.edit({ type: "separateAudio", id: "B", linked: true })).toBe(
      true,
    );
    const separated = serializeProject(useEditor.getState().project);
    expect(
      state.edit({ type: "move", ids: ["B"], trackId: upper.id, delta: -S }),
    ).toBe(true);
    const moved = serializeProject(useEditor.getState().project);
    state.undo();
    expect(serializeProject(useEditor.getState().project)).toBe(separated);
    state.undo();
    expect(useEditor.getState().project).toEqual(p);
    state.redo();
    state.redo();
    expect(serializeProject(useEditor.getState().project)).toBe(moved);
    state.select("B");
    state.duplicate();
    expect(useEditor.getState().error).toBeNull();
    expect(useEditor.getState().project.tracks[0].clips).toHaveLength(2);
    expect(useEditor.getState().project.tracks[3].clips).toHaveLength(2);
  });
  for (const fps of [24, 25, 30, 60])
    test(`scrubbing quantizes and clamps at ${fps} FPS`, () => {
      const p = fixture();
      p.frameRate = fps;
      expect(seekFrame(p, -S)).toBe(0);
      expect(seekFrame(p, 14 * S)).toBe(frame(p, 14 * fps - 1));
      expect(seekFrame(p, 100 * S)).toBe(frame(p, 14 * fps - 1));
      for (const index of [1, 7, 31, 123]) {
        expect(seekFrame(p, frame(p, index) + 100)).toBe(frame(p, index));
        expect(Number.isSafeInteger(seekFrame(p, frame(p, index)))).toBe(true);
      }
      p.tracks[1].clips = [
        {
          ...p.tracks[1].clips[0],
          timelineDuration: frame(p, 7),
          sourceOut: frame(p, 7),
        },
      ];
      expect(seekFrame(p, S)).toBe(frame(p, 6));
      useEditor.getState().load(p);
      useEditor.setState({ playing: true });
      useEditor.getState().seek(frame(p, 3) + 100);
      expect(useEditor.getState().playhead).toBe(frame(p, 3));
      expect(useEditor.getState().playing).toBe(false);
    });
  test("vertical move retains embedded sound; linked audio follows time but retains track and source", () => {
    let p = fixture();
    const upper = newTrack("video", "Upper");
    p.tracks.unshift(upper);
    p = editProject(p, { type: "separateAudio", id: "B", linked: true });
    const audio = p.tracks[3].clips[0];
    const before = structuredClone(audio);
    p = editProject(p, {
      type: "move",
      ids: ["B", audio.id],
      anchorId: "B",
      trackId: upper.id,
      delta: 0,
    });
    expect(p.tracks[0].clips[0].audioEnabled).toBe(false);
    expect(p.tracks[3].clips[0]).toEqual(before);
    p = editProject(p, { type: "move", ids: ["B"], delta: -2 * S });
    expect(p.tracks[0].clips[0].timelineStart).toBe(3 * S);
    expect(p.tracks[3].clips[0]).toEqual({ ...before, timelineStart: 3 * S });
    expect(p.tracks[0].clips[0].groupId).toBe(before.groupId);
    expect(parseProject(serializeProject(p)).tracks).toEqual(p.tracks);
    p = editProject(p, { type: "link", ids: ["B"], unlink: true });
    p = editProject(p, { type: "move", ids: ["B"], delta: S });
    expect(p.tracks[3].clips[0].timelineStart).toBe(3 * S);
    expect(p.tracks[3].clips[0].groupId).toBeUndefined();
  });
  test("split attached video moves to overlapping layer without extracting audio", () => {
    let p = fixture();
    const upper = newTrack("video", "Upper");
    p.tracks.unshift(upper);
    p = editProject(p, { type: "split", ids: ["A"], at: 2 * S });
    const right = p.tracks[2].clips[1];
    p = editProject(p, {
      type: "move",
      ids: [right.id],
      delta: -S,
      trackId: upper.id,
    });
    expect(p.tracks[0].clips[0]).toEqual({
      ...right,
      timelineStart: S,
      trackId: upper.id,
    });
    expect(p.tracks[0].clips[0].audioEnabled).not.toBe(false);
    expect(p.tracks[3].clips).toEqual([]);
  });
  test("invalid types, collision, locked linked audio and locked targets reject atomically", () => {
    let p = fixture();
    p = editProject(p, { type: "separateAudio", id: "B", linked: true });
    const serialized = serializeProject(p);
    expect(() =>
      editProject(p, {
        type: "move",
        ids: ["B"],
        delta: 0,
        trackId: p.tracks[2].id,
      }),
    ).toThrow("Invalid drop");
    expect(() =>
      editProject(p, { type: "move", ids: ["B"], delta: -S }),
    ).toThrow("overlap");
    expect(serializeProject(p)).toBe(serialized);
    const upper = newTrack("video", "Upper");
    p.tracks.unshift(upper);
    p.tracks[3].locked = true;
    expect(() =>
      editProject(p, { type: "move", ids: ["B"], delta: S, trackId: upper.id }),
    ).toThrow("Unlock");
    p.tracks[3].locked = false;
    upper.locked = true;
    expect(() =>
      editProject(p, { type: "move", ids: ["B"], delta: 0, trackId: upper.id }),
    ).toThrow("Unlock");
    expect(() =>
      editProject(p, { type: "insert", clip: newClip(p.tracks[3].id, asset) }),
    ).toThrow("Extract Audio");
  });
  test("extraction is independent, preserves mapping and prevents duplicate embedded sound", () => {
    const p = editProject(fixture(), {
      type: "separateAudio",
      id: "B",
      linked: false,
    });
    const audio = p.tracks[2].clips[0],
      video = p.tracks[1].clips[1];
    expect(audio.groupId).toBeUndefined();
    expect(audio.audioEnabled).not.toBe(false);
    expect(video.audioEnabled).toBe(false);
    expect([
      audio.sourceIn,
      audio.sourceOut,
      audio.timelineStart,
      audio.playbackSpeed,
    ]).toEqual([
      video.sourceIn,
      video.sourceOut,
      video.timelineStart,
      video.playbackSpeed,
    ]);
    expect(() =>
      editProject(p, { type: "separateAudio", id: "B", linked: false }),
    ).toThrow("Already separated");
  });
  test("crop is optional, validated and round trips in existing schema", () => {
    const p = fixture();
    p.tracks[1].clips[0].transform.crop = {
      left: 0.25,
      right: 0,
      top: 0,
      bottom: 0.1,
    };
    expect(parseProject(serializeProject(p))).toEqual(p);
    p.tracks[1].clips[0].transform.crop.right = 0.75;
    expect(() => validateProject(p)).toThrow("Crop");
    p.tracks[1].clips[0].transform.crop.right = NaN;
    expect(() => validateProject(p)).toThrow("crop right");
  });
});
