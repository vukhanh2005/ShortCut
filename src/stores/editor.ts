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
} from "../editor/model.js";
import { editProject, linkedIds, type Edit } from "../editor/timeline.js";
interface Snapshot {
  project: Project;
  selection: string[];
  playhead: number;
  activeTrack: string;
}
interface EditorState extends Snapshot {
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
  paste: () => void;
  duplicate: () => void;
  load: (project: Project, path?: string | null) => void;
  save: (saveAs?: boolean) => Promise<boolean>;
  importAssets: (result: { assets: MediaAsset[]; errors: string[] }) => void;
}
const initial = newProject();
const snapshot = (s: EditorState): Snapshot => ({
  project: s.project,
  selection: s.selection,
  playhead: s.playhead,
  activeTrack: s.activeTrack,
});
export const useEditor = create<EditorState>((set, get) => ({
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
  transact(recipe, selection) {
    const state = get();
    try {
      const draft = structuredClone(state.project);
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
      });
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },
  edit: (command) => get().transact((p) => editProject(p, command)),
  undo() {
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
    set({
      playhead: Math.round(
        Math.max(0, Math.min(duration(get().project), time)),
      ),
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
    get().transact(
      (p) => {
        const ripple = p.settings.ripple;
        if (at === undefined) p.settings.ripple = false;
        const next = editProject(p, { type: "insert", clip });
        next.settings.ripple = ripple;
        return next;
      },
      [clip.id],
    );
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
    get().transact(
      (p) => {
        const ripple = p.settings.ripple;
        p.settings.ripple = false;
        const next = editProject(p, { type: "insert", clip });
        next.settings.ripple = ripple;
        return next;
      },
      [clip.id],
    );
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
  paste() {
    const s = get();
    if (!s.clipboard.length) return;
    const first = Math.min(...s.clipboard.map((c) => c.timelineStart)),
      groups = new Map<string, string>();
    const clips = structuredClone(s.clipboard).map((c) => {
      c.id = uid();
      c.timelineStart += s.playhead - first;
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
      set({ playhead: Math.max(...clips.map(end)) });
      get().paste();
    }
  },
  load(project, path = null) {
    validateProject(project);
    set({
      project,
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
      error: null,
    });
  },
  async save(saveAs = false) {
    const s = get();
    if (s.busy) return false;
    set({ busy: "Saving project" });
    try {
      const file = await window.studio.saveProject(s.project, s.path, saveAs);
      if (!file) return false;
      const saved = serializeProject(s.project);
      set({
        path: file,
        saved,
        dirty: serializeProject(get().project) !== saved,
      });
      if (!get().dirty) await window.studio.clearRecovery();
      return true;
    } catch (error) {
      set({ error: String(error) });
      return false;
    } finally {
      set({ busy: null });
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
