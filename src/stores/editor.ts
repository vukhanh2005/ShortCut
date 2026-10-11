import { create } from "zustand";
import {
  type Clip,
  type MediaAsset,
  type Project,
  type TrackKind,
  newProject,
  newTrack,
  newClip,
  uid,
  validateProject,
  serializeProject,
  end,
  duration,
  seekFrame,
  cloneProject,
} from "../editor/model.js";
import { editProject, linkedIds, type Edit } from "../editor/timeline.js";
interface Snapshot {
  project: Project;
  selection: string[];
  playhead: number;
  activeTrack: string;
}
interface EditorState extends Snapshot {
  interactive: { key: string; base: Snapshot; project: Project } | null;
  beginInteractive: (key: string) => void;
  updateInteractive: (recipe: (p: Project) => Project | void) => boolean;
  commitInteractive: () => boolean;
  cancelInteractive: () => void;
  path: string | null;
  saved: string;
  dirty: boolean;
  playing: boolean;
  zoom: number;
  past: Snapshot[];
  future: Snapshot[];
  clipboard: Clip[];
  error: string | null;
  busy: string | null;
  draggingAssetId: string | null;
  draggingAssetIds: string[];
  assetSelection: string[];
  toggleSnapping: () => void;
  transact: (
    recipe: (p: Project) => Project | void,
    selection?: string[],
  ) => boolean;
  edit: (command: Edit) => boolean;
  undo: () => void;
  redo: () => void;
  select: (id: string, additive?: boolean) => void;
  seek: (time: number) => void;
  addAsset: (asset: MediaAsset, trackId?: string, at?: number) => void;
  addText: () => void;
  addTrack: (type: TrackKind) => void;
  copy: () => void;
  paste: (at?: number) => void;
  duplicate: () => void;
  load: (project: Project, path?: string | null, expected?: Project) => void;
  save: (saveAs?: boolean) => Promise<boolean>;
  importAssets: (result: { assets: MediaAsset[]; errors: string[] }) => void;
}
const initial = newProject();
const snappingPreference = () => {
  try {
    const value = globalThis.localStorage?.getItem("shortcut.snapping");
    return value === null || value === undefined ? undefined : value === "true";
  } catch {
    return undefined;
  }
};
initial.settings.snapping = snappingPreference() ?? initial.settings.snapping;
let documentGeneration = 0;
const snapshot = (s: EditorState): Snapshot => ({
  project: s.project,
  selection: s.selection,
  playhead: s.playhead,
  activeTrack: s.activeTrack,
});
export const effectiveProject = (s: EditorState) =>
  s.interactive?.project ?? s.project;
export const useEditor = create<EditorState>((set, get) => ({
  interactive: null,
  beginInteractive(key) {
    if (get().interactive?.key === key) return;
    get().commitInteractive();
    const state = get();
    set({
      interactive: { key, base: snapshot(state), project: state.project },
      playing: false,
      error: null,
    });
  },
  updateInteractive(recipe) {
    const edit = get().interactive;
    if (!edit || edit.base.project !== get().project) return false;
    try {
      const draft = cloneProject(edit.project),
        next = recipe(draft) ?? draft;
      validateProject(next);
      set({ interactive: { ...edit, project: next }, error: null });
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },
  commitInteractive() {
    const edit = get().interactive;
    if (!edit) return true;
    set({ interactive: null });
    if (get().project !== edit.base.project) return false;
    if (serializeProject(edit.project) === serializeProject(edit.base.project))
      return true;
    return get().transact(() => edit.project);
  },
  cancelInteractive() {
    set({ interactive: null, error: null });
  },
  project: initial,
  path: null,
  saved: serializeProject(initial),
  dirty: false,
  selection: [],
  activeTrack: initial.tracks[1].id,
  playhead: 0,
  playing: false,
  zoom: 80,
  past: [],
  future: [],
  clipboard: [],
  error: null,
  busy: null,
  draggingAssetId: null,
  draggingAssetIds: [],
  assetSelection: [],
  toggleSnapping() {
    const enabled = !get().project.settings.snapping;
    try {
      globalThis.localStorage?.setItem("shortcut.snapping", String(enabled));
    } catch {
      /* Project setting still persists on save. */
    }
    get().transact((p) => {
      p.settings.snapping = enabled;
    });
  },
  transact(recipe, selection) {
    if (get().interactive) get().commitInteractive();
    const state = get();
    try {
      const draft = cloneProject(state.project);
      const next = recipe(draft) ?? draft;
      validateProject(next);
      set({
        project: next,
        past: [...state.past.slice(-49), snapshot(state)],
        future: [],
        dirty: serializeProject(next) !== state.saved,
        selection: (selection ?? state.selection).filter((id) =>
          next.tracks.some((t) => t.clips.some((c) => c.id === id)),
        ),
        error: null,
        playing: false,
        playhead: seekFrame(next, state.playhead),
        activeTrack: next.tracks.some((t) => t.id === state.activeTrack)
          ? state.activeTrack
          : next.tracks[0].id,
      });
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },
  edit: (command) => get().transact((p) => editProject(p, command)),
  undo() {
    if (get().interactive) {
      get().cancelInteractive();
      return;
    }
    const s = get(),
      prior = s.past.at(-1);
    if (!prior) return;
    set({
      ...prior,
      past: s.past.slice(0, -1),
      future: [snapshot(s), ...s.future].slice(0, 50),
      dirty: serializeProject(prior.project) !== s.saved,
      playing: false,
      error: null,
    });
  },
  redo() {
    get().cancelInteractive();
    const s = get(),
      next = s.future[0];
    if (!next) return;
    set({
      ...next,
      past: [...s.past, snapshot(s)].slice(-50),
      future: s.future.slice(1),
      dirty: serializeProject(next.project) !== s.saved,
      playing: false,
      error: null,
    });
  },
  select(id, additive = false) {
    get().commitInteractive();
    const s = get(),
      track = s.project.tracks.find((t) => t.clips.some((c) => c.id === id));
    const related = [...linkedIds(s.project, [id])];
    set({
      selection: additive
        ? s.selection.includes(id)
          ? s.selection.filter((v) => !related.includes(v))
          : [...new Set([...s.selection, ...related])]
        : related,
      activeTrack: track?.id ?? s.activeTrack,
    });
  },
  seek(time) {
    if (!Number.isFinite(time)) return;
    set({
      playhead: seekFrame(get().project, time),
      playing: false,
    });
  },
  addAsset(asset, trackId, at) {
    const s = get();
    const track =
      s.project.tracks.find((t) => t.id === trackId) ??
      s.project.tracks.find(
        (t) =>
          t.type === (asset.type === "audio" ? "audio" : "video") && !t.locked,
      );
    if (!track) {
      set({ error: "Add an unlocked matching track first." });
      return;
    }
    const clip = newClip(
      track.id,
      asset,
      at ?? Math.max(0, ...track.clips.map(end)),
    );
    get().transact((p) => editProject(p, { type: "insert", clip }), [clip.id]);
    set({ activeTrack: track.id });
  },
  addText() {
    const s = get(),
      track = s.project.tracks.find((t) => t.type === "subtitle" && !t.locked);
    if (!track) {
      set({ error: "Add an unlocked subtitle track first." });
      return;
    }
    const clip = newClip(track.id, undefined, s.playhead);
    clip.transform.y = s.project.resolution.height * 0.34;
    clip.text!.size = Math.round(s.project.resolution.width * 0.06);
    get().transact((p) => editProject(p, { type: "insert", clip }), [clip.id]);
  },
  addTrack(type) {
    const track = newTrack(
      type,
      `${type === "video" ? "Video" : type === "audio" ? "Audio" : "Captions"} ${get().project.tracks.filter((t) => t.type === type).length + 1}`,
    );
    if (
      get().transact((p) => {
        p.tracks.unshift(track);
      })
    )
      set({ activeTrack: track.id });
  },
  copy() {
    const s = get(),
      ids = linkedIds(s.project, s.selection);
    set({
      clipboard: structuredClone(
        s.project.tracks.flatMap((t) => t.clips).filter((c) => ids.has(c.id)),
      ),
    });
  },
  paste(at = get().playhead) {
    const s = get();
    if (!s.clipboard.length) return;
    const first = Math.min(...s.clipboard.map((c) => c.timelineStart)),
      groups = new Map<string, string>();
    const clips = structuredClone(s.clipboard).map((c) => {
      c.id = uid();
      if (s.project.tracks.find((t) => t.id === c.trackId)?.type === "audio")
        c.audioOnly = true;
      c.timelineStart += at - first;
      if (c.groupId) {
        if (!groups.has(c.groupId)) groups.set(c.groupId, uid());
        c.groupId = groups.get(c.groupId);
      }
      return c;
    });
    get().transact(
      (p) => {
        for (const c of clips) {
          const track = p.tracks.find((t) => t.id === c.trackId);
          if (!track || track.locked)
            throw new Error("Paste needs original unlocked tracks.");
          track.clips.push(c);
        }
      },
      clips.map((c) => c.id),
    );
  },
  duplicate() {
    const s = get();
    s.copy();
    const clips = get().clipboard;
    if (clips.length) {
      const at = Math.max(...clips.map(end));
      get().paste(at);
      if (get().project !== s.project) get().seek(at);
    }
  },
  load(project, path = null, expected) {
    if (
      expected &&
      (get().project !== expected ||
        (get().interactive &&
          serializeProject(effectiveProject(get())) !==
            serializeProject(expected)))
    )
      throw new Error(
        "Project changed while opening. Current edits were kept; open again when ready.",
      );
    validateProject(project);
    const preference = snappingPreference();
    if (preference !== undefined && preference !== project.settings.snapping)
      project = {
        ...project,
        settings: { ...project.settings, snapping: preference },
      };
    documentGeneration++;
    set({
      project,
      interactive: null,
      assetSelection: [],
      draggingAssetIds: [],
      path,
      saved: serializeProject(project),
      dirty: false,
      selection: [],
      playhead: 0,
      playing: false,
      activeTrack:
        project.tracks.find((t) => t.type === "video")?.id ??
        project.tracks[0].id,
      past: [],
      future: [],
      clipboard: [],
      error: null,
    });
  },
  async save(saveAs = false) {
    get().commitInteractive();
    const s = get();
    const generation = documentGeneration;
    if (s.busy) return false;
    set({ busy: "Saving project" });
    try {
      const file = await window.studio.saveProject(s.project, s.path, saveAs);
      if (!file) return false;
      if (generation !== documentGeneration) return true;
      const saved = serializeProject(s.project);
      set({
        path: file,
        saved,
        dirty: serializeProject(get().project) !== saved,
      });
      if (!get().dirty) await window.studio.clearRecovery();
      return true;
    } catch (error) {
      if (generation === documentGeneration) set({ error: String(error) });
      return false;
    } finally {
      if (get().busy === "Saving project") set({ busy: null });
    }
  },
  importAssets(result) {
    if (result.assets.length)
      get().transact((p) => {
        for (const asset of result.assets)
          if (!p.mediaAssets.some((a) => a.path === asset.path))
            p.mediaAssets.push(asset);
      });
    if (result.errors.length) set({ error: result.errors.join("\n") });
  },
}));
