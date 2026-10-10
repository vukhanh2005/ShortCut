import { useEffect, useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Download,
  Save,
  FolderOpen,
  FilePlus2,
  Keyboard,
  X,
  Check,
  Folder,
  LoaderCircle,
} from "lucide-react";
import { useEditor } from "../stores/editor";
import { duration, frame, newProject, serializeProject } from "../editor/model";
import { MediaLibrary, busyTask } from "../components/MediaLibrary";
import { Preview } from "../components/Preview";
import { Timeline } from "../components/Timeline";
import { Inspector, NumberField } from "../components/Inspector";
import type { ExportProgress } from "../types/bridge";
function Modal({
  title,
  close,
  children,
  preventClose = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  preventClose?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current!.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!preventClose) close();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button
          aria-label="Close dialog"
          disabled={preventClose}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function NewProjectDialog({ close }: { close: () => void }) {
  const [width, setWidth] = useState(1080),
    [height, setHeight] = useState(1920),
    [fps, setFps] = useState(30),
    [name, setName] = useState("Untitled project"),
    [error, setError] = useState("");
  const presets = [
    { name: "YouTube Shorts / 30", w: 1080, h: 1920, fps: 30 },
    { name: "YouTube Shorts / 60", w: 1080, h: 1920, fps: 60 },
    { name: "YouTube landscape", w: 1920, h: 1080, fps: 30 },
    { name: "Square", w: 1080, h: 1080, fps: 30 },
    { name: "Portrait 4:5", w: 1080, h: 1350, fps: 30 },
  ];
  return (
    <Modal title="Start a new story" close={close}>
      <p className="muted">
        Choose your canvas. Media stays at its original quality.
      </p>
      <label className="field">
        <span>Project name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            key={p.name}
            className={
              width === p.w && height === p.h && fps === p.fps ? "active" : ""
            }
            onClick={() => {
              setWidth(p.w);
              setHeight(p.h);
              setFps(p.fps);
            }}
          >
            <span
              className="preset-shape"
              style={{ aspectRatio: `${p.w}/${p.h}` }}
            />
            <span>
              {p.name}
              <small>
                {p.w} x {p.h} / {p.fps} FPS
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="field-grid">
        <NumberField
          label="Width"
          value={width}
          min={64}
          max={3840}
          step={2}
          onChange={setWidth}
        />
        <NumberField
          label="Height"
          value={height}
          min={64}
          max={3840}
          step={2}
          onChange={setHeight}
        />
      </div>
      <label className="field">
        <span>Frame rate</span>
        <select value={fps} onChange={(e) => setFps(+e.target.value)}>
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="primary wide-button"
        onClick={() => {
          try {
            const p = newProject(width, height, fps);
            p.name = name;
            useEditor.getState().load(p);
            close();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        Create project
      </button>
    </Modal>
  );
}
function ExportDialog({ close, nvenc }: { close: () => void; nvenc: boolean }) {
  const project = useEditor((s) => s.project),
    [quality, setQuality] = useState(20),
    [audio, setAudio] = useState(192),
    [hardware, setHardware] = useState(nvenc);
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState<ExportProgress>({
      fraction: 0,
      message: "Ready to render",
    }),
    [output, setOutput] = useState(""),
    [error, setError] = useState("");
  useEffect(() => window.studio.onProgress(setProgress), []);
  const start = async () => {
    setRunning(true);
    setError("");
    setOutput("");
    setProgress({ fraction: 0, message: "Choose output file" });
    useEditor.setState({ playing: false });
    try {
      const file = await window.studio.exportVideo(project, {
        quality,
        audioBitrate: audio,
        hardware,
      });
      if (file) setOutput(file);
      else
        setProgress({ fraction: 0, message: "Choose an output file to start" });
    } catch (error) {
      setError(String(error));
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal title="Export your story" close={close} preventClose={running}>
      <div className="export-summary">
        <span>MP4</span>
        <div>
          <strong>H.264 + AAC</strong>
          <p>
            {project.resolution.width} x {project.resolution.height} /{" "}
            {project.frameRate} FPS
          </p>
        </div>
      </div>
      <p className="muted">
        Uses project canvas, tracks, timing, transforms, captions and sound.
        Choose a new output filename.
      </p>
      <fieldset disabled={running}>
        <label className="field">
          <span>Video quality</span>
          <select value={quality} onChange={(e) => setQuality(+e.target.value)}>
            <option value={18}>High quality / larger file</option>
            <option value={20}>Recommended</option>
            <option value={23}>Balanced</option>
            <option value={28}>Smaller file</option>
          </select>
        </label>
        <label className="field">
          <span>Audio bitrate</span>
          <select value={audio} onChange={(e) => setAudio(+e.target.value)}>
            {[128, 192, 256, 320].map((n) => (
              <option key={n} value={n}>
                {n} kbps
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hardware}
            disabled={!nvenc}
            onChange={(e) => setHardware(e.target.checked)}
          />{" "}
          {nvenc
            ? "NVIDIA NVENC (CPU fallback enabled)"
            : "CPU encoder / NVENC unavailable"}
        </label>
      </fieldset>
      <div className="export-progress">
        <progress max={1} value={progress.fraction} />
        <span>
          {progress.message} <b>{Math.round(progress.fraction * 100)}%</b>
        </span>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {output && (
        <p className="output-path">
          <Check size={16} /> {output}
        </p>
      )}
      <div className="modal-actions">
        {running ? (
          <button onClick={() => void window.studio.cancelExport()}>
            Cancel export
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => void start()}
            disabled={!duration(project)}
          >
            <Download size={16} />{" "}
            {output ? "Export again" : "Choose file & export"}
          </button>
        )}
        {output && (
          <button onClick={() => void window.studio.showOutput()}>
            <Folder size={16} /> Open folder
          </button>
        )}
      </div>
    </Modal>
  );
}
export function App() {
  const s = useEditor(),
    [modal, setModal] = useState<"new" | "export" | "keys" | "recovery" | null>(
      null,
    ),
    [left, setLeft] = useState(260),
    [right, setRight] = useState(280),
    [bottom, setBottom] = useState(280);
  const [environment, setEnvironment] = useState<{
      ffmpeg: boolean;
      version: string;
      nvenc: boolean;
      recent: string[];
    } | null>(null),
    [recentOpen, setRecentOpen] = useState(false);
  useEffect(() => {
    window.studio
      .environment()
      .then((e) => {
        setEnvironment(e);
        if (e.recovery) setModal("recovery");
        if (!e.ffmpeg) useEditor.setState({ error: e.version });
      })
      .catch((error) => useEditor.setState({ error: String(error) }));
  }, []);
  useEffect(() => {
    if (!s.dirty || modal === "recovery") return;
    const timer = setTimeout(() => {
      window.studio.autosave(s.project).catch((error) =>
        useEditor.setState({
          error: `Recovery save failed: ${String(error)}`,
        }),
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [s.project, s.dirty, modal]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const discard = () =>
    !useEditor.getState().dirty ||
    window.confirm("Discard unsaved changes? Save first to keep them.");
  const open = (recent?: string) => {
    if (!discard()) return;
    void busyTask("Opening project", async () => {
      const result = await window.studio.openProject(recent);
      if (result) s.load(result.project, result.path);
    });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      const state = useEditor.getState(),
        control = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (control && ["s", "z", "y", "c", "v", "x", "a", "b"].includes(k)) {
        e.preventDefault();
        if (k === "s") void state.save(e.shiftKey);
        if (k === "z") state.undo();
        if (k === "y") state.redo();
        if (k === "c") state.copy();
        if (k === "v") state.paste();
        if (k === "x") {
          state.copy();
          if (state.selection.length)
            state.edit({ type: "delete", ids: state.selection });
        }
        if (k === "a")
          useEditor.setState({
            selection:
              state.project.tracks
                .find((t) => t.id === state.activeTrack)
                ?.clips.map((c) => c.id) ?? [],
          });
        if (k === "b" && state.selection.length)
          state.edit({
            type: "split",
            ids: state.selection,
            at: state.playhead,
          });
      } else if (e.code === "Space") {
        e.preventDefault();
        if (duration(state.project))
          useEditor.setState({
            playing: !state.playing,
            ...(state.playhead >= duration(state.project)
              ? { playhead: 0 }
              : {}),
          });
      } else if (e.key === "Delete" && state.selection.length) {
        e.preventDefault();
        state.edit({ type: "delete", ids: state.selection });
      } else if (e.key === "Home") {
        e.preventDefault();
        state.seek(0);
      } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        state.seek(
          frame(
            state.project,
            Math.round((state.playhead * state.project.frameRate) / 1e6) +
              (e.key === "ArrowLeft" ? -1 : 1),
          ),
        );
      } else if (["+", "=", "-"].includes(e.key)) {
        e.preventDefault();
        useEditor.setState({
          zoom: Math.max(
            20,
            Math.min(240, state.zoom + (e.key === "-" ? -10 : 10)),
          ),
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const resize = (
    e: React.PointerEvent,
    panel: "left" | "right" | "bottom",
  ) => {
    e.preventDefault();
    const origin = panel === "bottom" ? e.clientY : e.clientX,
      original = panel === "left" ? left : panel === "right" ? right : bottom;
    const move = (event: PointerEvent) => {
      const delta =
        (panel === "bottom" ? event.clientY : event.clientX) - origin;
      if (panel === "left")
        setLeft(Math.max(210, Math.min(360, original + delta)));
      else if (panel === "right")
        setRight(Math.max(240, Math.min(360, original - delta)));
      else
        setBottom(
          Math.max(180, Math.min(window.innerHeight - 330, original - delta)),
        );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  const divider = (panel: "left" | "right" | "bottom") => (
    <div
      className={`divider divider-${panel}`}
      role="separator"
      aria-label={`Resize ${panel} panel`}
      aria-orientation={panel === "bottom" ? "horizontal" : "vertical"}
      aria-valuenow={
        panel === "left" ? left : panel === "right" ? right : bottom
      }
      tabIndex={0}
      onPointerDown={(e) => resize(e, panel)}
      onKeyDown={(e) => {
        const delta = ["ArrowRight", "ArrowDown"].includes(e.key) ? 10 : -10;
        if (!e.key.startsWith("Arrow")) return;
        e.preventDefault();
        if (panel === "left")
          setLeft(Math.max(210, Math.min(360, left + delta)));
        else if (panel === "right")
          setRight(Math.max(240, Math.min(360, right - delta)));
        else
          setBottom(
            Math.max(180, Math.min(window.innerHeight - 330, bottom - delta)),
          );
      }}
    />
  );
  return (
    <main
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void busyTask("Importing dropped media", async () =>
            s.importAssets(
              await window.studio.importDropped([...e.dataTransfer.files]),
            ),
          );
        }
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S/</span>
          <h1>
            ShortCut <span>STUDIO</span>
          </h1>
        </div>
        <div className="file-actions">
          <button
            title="New project"
            aria-label="New project"
            onClick={() => {
              if (discard()) setModal("new");
            }}
          >
            <FilePlus2 size={16} />
          </button>
          <button
            title="Open project"
            aria-label="Open project"
            onClick={() => open()}
          >
            <FolderOpen size={17} />
          </button>
          <button
            title="Save (Ctrl+S)"
            aria-label="Save project"
            onClick={() => void s.save()}
          >
            <Save size={16} />
          </button>
          <button className="text-button" onClick={() => void s.save(true)}>
            Save as
          </button>
        </div>
        <div className="project-title">
          <input
            aria-label="Project name"
            key={s.project.id}
            defaultValue={s.project.name}
            onBlur={(e) => {
              if (e.target.value !== s.project.name)
                s.transact((p) => {
                  p.name = e.target.value;
                });
            }}
          />
          <span>
            {s.dirty
              ? "Unsaved changes"
              : s.path
                ? "Saved to disk"
                : "New project"}
          </span>
        </div>
        <div className="header-right">
          <button
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={17} />
          </button>
          <button title="Keyboard shortcuts" onClick={() => setModal("keys")}>
            <Keyboard size={17} />
          </button>
          <button
            className="primary export-button"
            onClick={() => setModal("export")}
            disabled={!duration(s.project) || !environment?.ffmpeg}
          >
            <Download size={16} /> Export
          </button>
        </div>
      </header>
      <div
        className="workspace"
        style={{ gridTemplateRows: `minmax(220px,1fr) 6px ${bottom}px` }}
      >
        <div
          className="upper-workspace"
          style={{
            gridTemplateColumns: `${left}px 6px minmax(200px,1fr) 6px ${right}px`,
          }}
        >
          <MediaLibrary />
          {divider("left")}
          <Preview />
          {divider("right")}
          <Inspector />
        </div>
        {divider("bottom")}
        <Timeline />
      </div>
      <footer className="statusbar">
        <span className="status-dot" />
        <span>
          {s.busy ??
            (environment?.ffmpeg
              ? "Media engine ready"
              : environment
                ? "FFmpeg unavailable"
                : "Checking media engine...")}
        </span>
        {s.busy && <LoaderCircle className="spinner" size={13} />}
        <div className="toolbar-spacer" />
        <button onClick={() => setRecentOpen(!recentOpen)}>
          Recent projects
        </button>
        <span>ShortCut Studio 0.1</span>
      </footer>
      {recentOpen && (
        <div className="recent-menu">
          <strong>Recent projects</strong>
          {environment?.recent.length ? (
            environment.recent.map((p) => (
              <button
                key={p}
                title={p}
                onClick={() => {
                  setRecentOpen(false);
                  open(p);
                }}
              >
                {p.split(/[\\/]/).at(-1)}
              </button>
            ))
          ) : (
            <p>No saved projects yet.</p>
          )}
          <button onClick={() => setRecentOpen(false)}>Close</button>
        </div>
      )}
      {s.error && (
        <div className="error-toast" role="alert">
          <div>
            <strong>Action needs attention</strong>
            <p>{s.error}</p>
          </div>
          <button
            aria-label="Dismiss error"
            onClick={() => useEditor.setState({ error: null })}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {modal === "new" && <NewProjectDialog close={() => setModal(null)} />}
      {modal === "export" && (
        <ExportDialog
          close={() => setModal(null)}
          nvenc={environment?.nvenc ?? false}
        />
      )}
      {modal === "keys" && (
        <Modal title="Keyboard shortcuts" close={() => setModal(null)}>
          <div className="shortcut-list">
            {[
              ["Space", "Play / pause"],
              ["Ctrl+S", "Save project"],
              ["Ctrl+Shift+S", "Save as"],
              ["Ctrl+Z / Ctrl+Y", "Undo / redo"],
              ["Ctrl+B", "Split selected at playhead"],
              ["Ctrl+C / V / X", "Copy / paste / cut"],
              ["Ctrl+A", "Select all on active track"],
              ["Delete", "Delete selected (respects ripple)"],
              ["Left / Right", "Step one project frame"],
              ["+ / -", "Timeline zoom"],
              ["Home", "Jump to start"],
            ].map(([key, label]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="muted">
            Shortcuts preserve normal text-input behavior. Paste needs empty
            space on original tracks.
          </p>
        </Modal>
      )}
      {modal === "recovery" && (
        <Modal title="Recover previous session?" close={() => setModal(null)}>
          <p>
            Separate recovery file found. Restore it as an unsaved project, or
            discard it to start fresh.
          </p>
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() =>
                void busyTask("Restoring recovery", async () => {
                  const result = await window.studio.recover();
                  if (result) {
                    s.load(result.project);
                    useEditor.setState({ dirty: true });
                  }
                  setModal(null);
                })
              }
            >
              Restore recovery
            </button>
            <button
              onClick={() =>
                void window.studio.clearRecovery().then(() => setModal(null))
              }
            >
              Discard recovery
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
