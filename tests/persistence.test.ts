import { afterEach, expect, test, vi } from "vitest";
import {
  newProject,
  newClip,
  serializeProject,
  type MediaAsset,
} from "../src/editor/model.js";
import { useEditor } from "../src/stores/editor.js";
import { validateReplacement } from "../electron/media.js";

const asset: MediaAsset = {
  id: "source",
  path: "D:/clip.mp4",
  name: "clip",
  type: "video",
  duration: 2_000_000,
  width: 160,
  height: 284,
  frameRate: 30,
  hasAudio: true,
  size: 1,
  folder: "",
  favorite: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  useEditor.setState({ busy: null });
});
function saving() {
  let finish!: (path: string) => void;
  const clearRecovery = vi.fn(async () => {});
  vi.stubGlobal("window", {
    studio: {
      saveProject: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      clearRecovery,
    },
  });
  useEditor.getState().load(newProject());
  return { finish: (path: string) => finish(path), clearRecovery };
}
test("late save completion cannot change a reopened document even with same project ID", async () => {
  const { finish, clearRecovery } = saving();
  const pending = useEditor.getState().save();
  const reopened = structuredClone(useEditor.getState().project);
  reopened.name = "Reopened revision";
  useEditor.getState().load(reopened, "D:/new.shortcut");
  finish("D:/old.shortcut");
  expect(await pending).toBe(true);
  expect(useEditor.getState().path).toBe("D:/new.shortcut");
  expect(useEditor.getState().saved).toBe(serializeProject(reopened));
  expect(clearRecovery).not.toHaveBeenCalled();
});
test("edits made during save remain dirty and retain recovery", async () => {
  const { finish, clearRecovery } = saving();
  const original = serializeProject(useEditor.getState().project);
  const pending = useEditor.getState().save();
  useEditor.getState().transact((p) => {
    p.name = "New edit";
  });
  finish("D:/saved.shortcut");
  await pending;
  expect(useEditor.getState().dirty).toBe(true);
  expect(useEditor.getState().saved).toBe(original);
  expect(useEditor.getState().project.name).toBe("New edit");
  expect(clearRecovery).not.toHaveBeenCalled();
});
test("opening snapshot rejects intervening edits; load clears foreign clipboard", () => {
  const state = useEditor.getState();
  state.load(newProject());
  const original = useEditor.getState().project;
  state.transact((p) => {
    p.name = "Keep this edit";
  });
  expect(() =>
    state.load(newProject(), "D:/opened.shortcut", original),
  ).toThrow("Current edits were kept");
  expect(useEditor.getState().project.name).toBe("Keep this edit");
  useEditor.setState({ clipboard: [newClip(original.tracks[1].id, asset)] });
  state.load(newProject());
  expect(useEditor.getState().clipboard).toEqual([]);
});
test("failed duplicate preserves playhead/history; successful duplicate undo restores original cursor", () => {
  const p = newProject();
  p.mediaAssets = [asset];
  const a = newClip(p.tracks[1].id, asset),
    b = newClip(p.tracks[1].id, asset, 2_000_000);
  p.tracks[1].clips = [a, b];
  const state = useEditor.getState();
  state.load(p);
  state.seek(500_000);
  state.select(a.id);
  state.duplicate();
  expect(useEditor.getState().project).toBe(p);
  expect(useEditor.getState().playhead).toBe(500_000);
  expect(useEditor.getState().past).toHaveLength(0);
  state.select(b.id);
  state.duplicate();
  expect(useEditor.getState().playhead).toBe(4_000_000);
  state.undo();
  expect(useEditor.getState().playhead).toBe(500_000);
  expect(useEditor.getState().project).toEqual(p);
});
test("opening snapshot rejects live edits before their transaction commits", () => {
  const state = useEditor.getState();
  state.load(newProject());
  const original = useEditor.getState().project;
  state.beginInteractive("name");
  state.updateInteractive((p) => {
    p.name = "Live edit";
  });
  expect(() =>
    state.load(newProject(), "D:/opened.shortcut", original),
  ).toThrow("Current edits were kept");
  expect(useEditor.getState().interactive?.project.name).toBe("Live edit");
  expect(useEditor.getState().project).toBe(original);
  state.cancelInteractive();
});
test("relink and hydration reject shorter media, changed kind and lost audio", () => {
  expect(() =>
    validateReplacement(asset, { ...asset, duration: 1_000_000 }),
  ).toThrow("shorter");
  expect(() => validateReplacement(asset, { ...asset, type: "audio" })).toThrow(
    "same media type",
  );
  expect(() =>
    validateReplacement(asset, { ...asset, hasAudio: false }),
  ).toThrow("audio stream");
  expect(() =>
    validateReplacement(asset, { ...asset, duration: 3_000_000 }),
  ).not.toThrow();
});
