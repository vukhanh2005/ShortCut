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
  uid,
} from "../src/editor/model.js";
import { editProject, snap } from "../src/editor/timeline.js";
import { useEditor } from "../src/stores/editor.js";
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
    expect(positions(editProject(p, { type: "insert", clip: c }))).toEqual([
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
    useEditor.getState().edit({ type: "insert", clip: c });
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
