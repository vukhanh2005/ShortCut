import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Scissors,
  Trash2,
  Copy,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Plus,
  Link,
  Unlink,
  ChevronUp,
  ChevronDown,
  Flag,
} from "lucide-react";
import { useEditor, effectiveProject } from "../stores/editor";
import {
  type Clip,
  type Track,
  SECOND,
  duration,
  end,
  seconds,
  ticks,
  formatTime,
  newTrack,
  newClip,
  type MediaAsset,
  uid,
} from "../editor/model";
import {
  resolveSnap,
  snapTargets,
  editProject,
  placementTarget,
  linkedIds,
  type Edit,
  type InsertMode,
  type SnapTarget,
} from "../editor/timeline";
import { waveformPaths, type Waveform } from "../editor/waveform";
import {
  intersects,
  selectionRect,
  rangeIds,
  type Rect,
} from "../editor/selection";
const ClipWaveform = memo(function ClipWaveform({
  asset,
  clip,
  zoom,
  viewport,
}: {
  asset: MediaAsset;
  clip: Clip;
  zoom: number;
  viewport: { left: number; width: number };
}) {
  const clipLeft = seconds(clip.timelineStart) * zoom;
  const left = Math.max(0, viewport.left - clipLeft);
  const width = Math.max(
    0,
    Math.min(
      seconds(clip.timelineDuration) * zoom,
      viewport.left + viewport.width - 176 - clipLeft,
    ) - left,
  );
  const wave = useMemo<Waveform | undefined>(() => {
    if (!asset.waveform) return undefined;
    if (!Array.isArray(asset.waveform)) return asset.waveform;
    return {
      version: 2,
      sampleRate: 48000,
      sampleCount: Math.round(seconds(asset.duration) * 48000),
      levels: [
        {
          samplesPerBin: Math.ceil(
            (seconds(asset.duration) * 48000) / asset.waveform.length,
          ),
          peaks: [asset.waveform],
          rms: [asset.waveform.map(() => 0)],
        },
      ],
    };
  }, [asset.waveform, asset.duration]);
  const paths = useMemo(
    () => wave && waveformPaths(wave, clip, zoom, left, width),
    [wave, clip, zoom, left, width],
  );
  if (!paths || !width || !wave) return null;
  return (
    <svg
      className="waveform"
      viewBox={`0 0 ${width} 32`}
      style={{ left, width }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="waveform-center"
        d={wave.levels[0].peaks
          .map((_, i, all) => `M0,${((i + 0.5) * 32) / all.length}h${width}`)
          .join(" ")}
      />
      <path d={paths.peaks} />
      <path className="waveform-rms" d={paths.rms} />
    </svg>
  );
});
export function Timeline() {
  const s = useEditor(),
    project = effectiveProject(s),
    { zoom } = s;
  const scroll = useRef<HTMLDivElement>(null),
    [viewport, setViewport] = useState({ left: 0, width: 1600 });
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
    null,
  );
  const length = Math.max(20, seconds(duration(project)) + 10),
    width = Math.max(800, length * zoom);
  const interval = zoom < 40 ? 5 : zoom < 100 ? 2 : 1;
  const trackEdit = (
    track: Track,
    action: (t: Track) => void,
    allowLocked = false,
  ) =>
    s.transact((p) => {
      const t = p.tracks.find((t) => t.id === track.id)!;
      if (t.locked && !allowLocked) throw new Error("Unlock track first.");
      action(t);
    });
  const ruler = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const selectionAnchor = useRef<string | undefined>(undefined);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>("smart");
  const [magnet, setMagnet] = useState<SnapTarget>();
  const [dragMode, setDragMode] = useState<string>();
  const autoScroll = useRef<{
    x: number;
    y: number;
    update: () => void;
  } | null>(null);
  const libraryTrack = useRef<Track | undefined>(undefined);
  const [drag, setDrag] = useState<{
    clips: Clip[];
    newTrack?: Track;
    extraTracks?: Track[];
    error?: string;
    label?: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    const host = scroll.current!;
    const observer = new ResizeObserver(() =>
      setViewport({ left: host.scrollLeft, width: host.clientWidth }),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let raf = 0,
      last = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(32, now - last) / 1000;
      last = now;
      const point = autoScroll.current,
        host = scroll.current;
      if (point && host) {
        const rect = host.getBoundingClientRect();
        const velocity = (v: number, min: number, max: number) =>
          v < min + 32
            ? -Math.min(1, (min + 32 - v) / 32)
            : v > max - 32
              ? Math.min(1, (v - max + 32) / 32)
              : 0;
        const left = host.scrollLeft,
          top = host.scrollTop;
        host.scrollLeft +=
          velocity(point.x, rect.left + 176, rect.right) * 480 * elapsed;
        host.scrollTop +=
          velocity(point.y, rect.top + 32, rect.bottom) * 280 * elapsed;
        if (left !== host.scrollLeft || top !== host.scrollTop) point.update();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const cancel = () => {
      autoScroll.current = null;
      libraryTrack.current = undefined;
      setDrag(null);
      setMagnet(undefined);
      setDragMode(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("dragend", cancel);
    window.addEventListener("drop", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("dragend", cancel);
      window.removeEventListener("drop", cancel);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const pointerTime = (x: number) =>
    ticks(
      (x - ruler.current!.getBoundingClientRect().left) /
        useEditor.getState().zoom,
    );
  const capture = (
    e: React.PointerEvent,
    move: (event: PointerEvent) => void,
    finish: (cancelled: boolean) => void,
  ) => {
    cleanup.current?.();
    const host = scroll.current!;
    host.focus({ preventScroll: true });
    const id = e.pointerId;
    host.setPointerCapture(id);
    const moving = (event: PointerEvent) => {
      if (event.pointerId === id) {
        autoScroll.current = {
          x: event.clientX,
          y: event.clientY,
          update: () => move(event),
        };
        move(event);
      }
    };
    const done = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      const cancelled = event.type !== "pointerup";
      if (!cancelled) move(event);
      clean();
      finish(cancelled);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clean();
        finish(true);
      }
    };
    const clean = () => {
      autoScroll.current = null;
      setDragMode(undefined);
      setMagnet(undefined);
      host.removeEventListener("pointermove", moving);
      host.removeEventListener("pointerup", done);
      host.removeEventListener("pointercancel", done);
      host.removeEventListener("lostpointercapture", done);
      window.removeEventListener("keydown", key);
      if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
      cleanup.current = null;
    };
    host.addEventListener("pointermove", moving);
    host.addEventListener("pointerup", done);
    host.addEventListener("pointercancel", done);
    host.addEventListener("lostpointercapture", done);
    window.addEventListener("keydown", key);
    cleanup.current = () => {
      clean();
      finish(true);
    };
  };
  const pointer = (
    e: React.PointerEvent,
    clip: Clip,
    edge?: "start" | "end",
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    scroll.current!.focus({ preventScroll: true });
    const project = useEditor.getState().project;
    clip =
      project.tracks.flatMap((t) => t.clips).find((c) => c.id === clip.id) ??
      clip;
    if (e.shiftKey) {
      const order = project.tracks
        .find((t) => t.id === clip.trackId)!
        .clips.map((c) => c.id);
      const ids = [
        ...linkedIds(
          project,
          rangeIds(order, selectionAnchor.current, clip.id),
        ),
      ];
      useEditor.setState({
        selection:
          e.ctrlKey || e.metaKey ? [...new Set([...s.selection, ...ids])] : ids,
        activeTrack: clip.trackId,
      });
      return;
    }
    selectionAnchor.current = clip.id;
    if (!s.selection.includes(clip.id))
      s.select(clip.id, e.ctrlKey || e.metaKey);
    else if (e.ctrlKey || e.metaKey) {
      s.select(clip.id, true);
      return;
    }
    if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return;
    useEditor.setState({ playing: false });
    setDragMode(edge ? `trim-${edge}` : "clip-move");
    const start = pointerTime(e.clientX),
      x = e.clientX,
      y = e.clientY;
    const ids = useEditor.getState().selection;
    const block = project.tracks
      .find((t) => t.id === clip.trackId)!
      .clips.filter((c) => ids.includes(c.id));
    const first = Math.min(...block.map((c) => c.timelineStart)),
      span = Math.max(...block.map(end)) - first;
    let command: Edit | undefined,
      error: string | undefined,
      moved = false;
    let created: Track | undefined, previous: SnapTarget | undefined;
    const targets = snapTargets(project, s.playhead, ids);
    capture(
      e,
      (event) => {
        moved ||=
          Math.abs(event.clientX - x) >= 3 || Math.abs(event.clientY - y) >= 3;
        if (!moved) return;
        const now = useEditor.getState();
        const delta = pointerTime(event.clientX) - start;
        const resolved =
          !edge && delta === 0
            ? { time: clip.timelineStart }
            : resolveSnap(
                project,
                (edge === "end" ? end(clip) : clip.timelineStart) + delta,
                now.zoom,
                targets,
                previous,
                edge ? [0] : [0, clip.timelineDuration],
              );
        const at = resolved.time;
        previous = resolved.target;
        setMagnet(resolved.target);
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const row = element?.closest<HTMLElement>("[data-track-id]");
        const zone = element?.closest<HTMLElement>("[data-create-track]")
          ?.dataset.createTrack as "video" | "audio" | undefined;
        if (zone && !edge && created?.type !== zone)
          created = newTrack(
            zone,
            `${zone === "video" ? "Video" : "Audio"} ${project.tracks.filter((t) => t.type === zone).length + 1}`,
          );
        command = edge
          ? { type: "trim", id: clip.id, edge, at }
          : {
              type: "move",
              ids,
              anchorId: clip.id,
              delta: at - clip.timelineStart,
              trackId: zone ? created?.id : row?.dataset.trackId,
              newTrack: zone ? created : undefined,
            };
        const placement =
          !edge && row && (insertMode === "smart" || insertMode === "ripple")
            ? placementTarget(
                project,
                row.dataset.trackId!,
                at + first - clip.timelineStart,
                span,
                pointerTime(event.clientX),
                ids,
              )
            : undefined;
        if (command.type === "move" && placement)
          command.placement = { ...placement, ripple: insertMode === "ripple" };
        try {
          if (now.project !== project)
            throw new Error("Project changed during drag. Try again.");
          if (!edge && !row && !zone)
            throw new Error("Drop on a matching timeline track.");
          const proposed = editProject(project, command);
          const original = new Map(
            project.tracks.flatMap((t) => t.clips).map((c) => [c.id, c]),
          );
          const clips = proposed.tracks
            .flatMap((t) => t.clips)
            .filter(
              (c) => JSON.stringify(c) !== JSON.stringify(original.get(c.id)),
            );
          error = undefined;
          setDragMode(
            zone && !edge
              ? "track-creation"
              : edge
                ? `trim-${edge}`
                : "clip-move",
          );
          setDrag({
            clips,
            newTrack: zone && !edge ? created : undefined,
            extraTracks: proposed.tracks.filter(
              (t) => !project.tracks.some((original) => original.id === t.id),
            ),
            x: event.clientX,
            y: event.clientY,
            label: placement
              ? `Insert ${placement.side} selected clip; shift destination sequence${insertMode === "ripple" ? " with ripple scope" : " and linked media"}`
              : undefined,
          });
        } catch (reason) {
          error = (reason as Error).message;
          setDrag({ clips: [], error, x: event.clientX, y: event.clientY });
        }
      },
      (cancelled) => {
        setDrag(null);
        if (cancelled || !moved) return;
        if (error) useEditor.setState({ error });
        else if (command) useEditor.getState().edit(command);
      },
    );
  };
  const seek = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let previous: SnapTarget | undefined;
    const targets = snapTargets(project);
    const update = (x: number) => {
      const resolved = resolveSnap(
        useEditor.getState().project,
        pointerTime(x),
        useEditor.getState().zoom,
        targets,
        previous,
      );
      previous = resolved.target;
      setMagnet(previous);
      useEditor.getState().seek(resolved.time);
    };
    update(e.clientX);
    capture(
      e,
      (event) => update(event.clientX),
      () => {},
    );
    setDragMode("playhead");
  };
  const selectArea = (e: React.PointerEvent, track: Track) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const host = scroll.current!,
      content = host.querySelector<HTMLElement>(".timeline-content")!;
    const initial = content.getBoundingClientRect(),
      x = e.clientX - initial.left,
      y = e.clientY - initial.top;
    const previous = useEditor.getState().selection,
      additive = e.ctrlKey || e.metaKey;
    let moved = false;
    capture(
      e,
      (event) => {
        const bounds = content.getBoundingClientRect();
        const nextX = event.clientX - bounds.left,
          nextY = event.clientY - bounds.top;
        moved ||= Math.abs(nextX - x) >= 3 || Math.abs(nextY - y) >= 3;
        if (!moved) return;
        const rectangle = selectionRect(x, y, nextX, nextY);
        setMarquee(rectangle);
        const ids: string[] = [];
        for (const row of project.tracks) {
          if (row.locked) continue;
          const element = content.querySelector<HTMLElement>(
            `[data-track-id="${CSS.escape(row.id)}"]`,
          )!;
          const top =
            element.getBoundingClientRect().top -
            bounds.top +
            (row.type === "subtitle" ? 15 : 8);
          for (const clip of row.clips)
            if (
              intersects(rectangle, {
                left: 176 + seconds(clip.timelineStart) * zoom,
                right: 176 + seconds(end(clip)) * zoom,
                top,
                bottom: top + (row.type === "subtitle" ? 43 : 59),
              })
            )
              ids.push(clip.id);
        }
        const linked = [...linkedIds(project, ids)];
        const eligible = linked.filter((id) =>
          [...linkedIds(project, [id])].every(
            (member) =>
              !project.tracks.some(
                (t) => t.locked && t.clips.some((c) => c.id === member),
              ),
          ),
        );
        useEditor.setState({
          selection: additive
            ? [...new Set([...previous, ...eligible])]
            : eligible,
          activeTrack: track.id,
        });
      },
      (cancelled) => {
        setMarquee(null);
        if (cancelled) useEditor.setState({ selection: previous });
        else if (!moved) {
          if (!additive)
            useEditor.setState({ selection: [], activeTrack: track.id });
          useEditor.getState().seek(pointerTime(e.clientX));
        }
      },
    );
    setDragMode("marquee");
  };
  const libraryProposal = (
    assets: MediaAsset[],
    x: number,
    track?: Track,
    kind?: "video" | "audio",
  ): Edit => {
    if (kind && libraryTrack.current?.type !== kind)
      libraryTrack.current = newTrack(
        kind,
        `${kind === "video" ? "Video" : "Audio"} ${project.tracks.filter((t) => t.type === kind).length + 1}`,
      );
    const destination = kind ? libraryTrack.current! : track!;
    if (!destination)
      throw new Error("Drop on a matching track or a new-track zone.");
    const resolved = resolveSnap(
      project,
      pointerTime(x),
      zoom,
      snapTargets(project, s.playhead),
    );
    setMagnet(resolved.target);
    const span = assets.reduce(
      (sum, a) => sum + newClip(destination.id, a).timelineDuration,
      0,
    );
    const placement =
      !kind && (insertMode === "smart" || insertMode === "ripple")
        ? placementTarget(
            project,
            destination.id,
            resolved.time,
            span,
            pointerTime(x),
          )
        : undefined;
    let at = placement?.at ?? resolved.time;
    const mixed =
      new Set(assets.map((a) => (a.type === "audio" ? "audio" : "video")))
        .size > 1;
    const newTracks: Track[] = kind ? [destination] : [];
    const clips = assets.map((asset) => {
      const type = asset.type === "audio" ? "audio" : "video";
      let target = destination;
      if (mixed && destination.type !== type) {
        target =
          [...project.tracks, ...newTracks].find(
            (t) =>
              t.type === type &&
              !t.locked &&
              t.clips.every(
                (c) => end(c) <= at || c.timelineStart >= at + asset.duration,
              ),
          ) ?? newTrack(type, `Imported ${type}`);
        if (!project.tracks.includes(target) && !newTracks.includes(target))
          newTracks.push(target);
      }
      const clip = newClip(target.id, asset, at);
      at += clip.timelineDuration;
      return clip;
    });
    return {
      type: "insertMany",
      clips,
      mode: insertMode === "smart" && !placement ? "normal" : insertMode,
      newTrack: kind ? destination : undefined,
      newTracks,
    };
  };
  const libraryDrag = (
    event: React.DragEvent,
    track?: Track,
    kind?: "video" | "audio",
    commit = false,
  ) => {
    const id =
      event.dataTransfer.getData("application/shortcut-asset") ||
      useEditor.getState().draggingAssetId;
    const asset = project.mediaAssets.find((a) => a.id === id);
    if (!asset) return;
    const selected = useEditor.getState().draggingAssetIds;
    const assets = selected.includes(id!)
      ? selected
          .map((id) => project.mediaAssets.find((a) => a.id === id)!)
          .filter(Boolean)
      : [asset];
    event.preventDefault();
    const x = event.clientX,
      y = event.clientY;
    const update = () => {
      try {
        const element = document.elementFromPoint(x, y);
        const zone = element?.closest<HTMLElement>("[data-create-track]")
          ?.dataset.createTrack as "video" | "audio" | undefined;
        const row = project.tracks.find(
          (t) =>
            t.id ===
            element?.closest<HTMLElement>("[data-track-id]")?.dataset.trackId,
        );
        const command = libraryProposal(
          assets,
          x,
          commit ? track : row,
          commit ? kind : zone,
        );
        const proposed = editProject(project, command);
        if (commit) {
          s.transact(
            () => proposed,
            command.type === "insertMany" ? command.clips.map((c) => c.id) : [],
          );
          setDrag(null);
          setMagnet(undefined);
          autoScroll.current = null;
        } else {
          setDragMode(zone ? "track-creation" : "library-insert");
          const originals = new Map(
            project.tracks
              .flatMap((t) => t.clips)
              .map((c) => [c.id, JSON.stringify(c)]),
          );
          setDrag({
            clips: proposed.tracks
              .flatMap((t) => t.clips)
              .filter((c) => JSON.stringify(c) !== originals.get(c.id)),
            newTrack: zone ? libraryTrack.current : undefined,
            extraTracks: proposed.tracks.filter(
              (t) => !project.tracks.some((original) => original.id === t.id),
            ),
            x,
            y,
            label: `${assets.length} asset${assets.length === 1 ? "" : "s"}; ${insertMode} placement`,
          });
        }
        return true;
      } catch (reason) {
        const error = (reason as Error).message;
        if (commit) useEditor.setState({ error });
        else setDrag({ clips: [], error, x, y });
        return false;
      }
    };
    event.dataTransfer.dropEffect = update() ? "copy" : "none";
    if (!commit) autoScroll.current = { x, y, update };
  };
  const creationZone = (kind: "video" | "audio") => {
    const track =
      drag?.extraTracks?.find((t) => t.type === kind) ??
      (drag?.newTrack?.type === kind ? drag.newTrack : undefined);
    return (
      <div
        className={`track-create-zone ${track ? "creating" : ""}`}
        data-create-track={kind}
        aria-label={`Create ${kind} track zone`}
        onDragOver={(e) => libraryDrag(e, undefined, kind)}
        onDrop={(e) => libraryDrag(e, undefined, kind, true)}
      >
        <span>+ {kind === "video" ? "Video layer" : "Audio track"}</span>
        {track &&
          drag?.clips
            .filter((c) => c.trackId === track.id)
            .map((c) => (
              <div
                key={c.id}
                className="drag-ghost"
                style={{
                  left: 176 + seconds(c.timelineStart) * zoom,
                  width: seconds(c.timelineDuration) * zoom,
                }}
              >
                {c.name}
              </div>
            ))}
      </div>
    );
  };
  return (
    <section
      className="timeline-panel"
      aria-label="Timeline"
      data-drag-mode={dragMode}
    >
      <div className="timeline-toolbar">
        <span className="panel-heading">TIMELINE</span>
        <button
          title="Split (Ctrl+B)"
          aria-label="Split selected"
          disabled={!s.selection.length}
          onClick={() =>
            s.edit({ type: "split", ids: s.selection, at: s.playhead })
          }
        >
          <Scissors size={16} />
        </button>
        <button
          title="Delete (Delete)"
          aria-label="Delete selected"
          disabled={!s.selection.length}
          onClick={() => s.edit({ type: "delete", ids: s.selection })}
        >
          <Trash2 size={16} />
        </button>
        <button
          title="Duplicate"
          aria-label="Duplicate selected"
          disabled={!s.selection.length}
          onClick={s.duplicate}
        >
          <Copy size={16} />
        </button>
        <button
          title="Link Audio/Video (matching start and duration)"
          disabled={s.selection.length < 2}
          onClick={() => s.edit({ type: "link", ids: s.selection })}
        >
          <Link size={16} />
        </button>
        <button
          title="Unlink Audio/Video"
          disabled={!s.selection.length}
          onClick={() =>
            s.edit({ type: "link", ids: s.selection, unlink: true })
          }
        >
          <Unlink size={16} />
        </button>
        <span className="toolbar-divider" />
        <button
          title="Add marker at playhead"
          onClick={() =>
            s.transact((p) => {
              (p.markers ??= []).push({
                id: uid(),
                time: s.playhead,
                name: `Marker ${(p.markers?.length ?? 0) + 1}`,
              });
            })
          }
        >
          <Flag size={16} />
        </button>
        <button
          className={project.settings.snapping ? "active" : ""}
          title="Toggle snapping"
          aria-pressed={project.settings.snapping}
          aria-keyshortcuts="N"
          onClick={s.toggleSnapping}
        >
          <Magnet size={16} />
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            aria-label="Ripple"
            checked={project.settings.ripple}
            onChange={(e) =>
              s.transact((p) => {
                p.settings.ripple = e.target.checked;
              })
            }
          />{" "}
          Ripple trim/delete
        </label>
        <select
          aria-label="Ripple scope"
          value={project.settings.rippleScope}
          onChange={(e) =>
            s.transact((p) => {
              p.settings.rippleScope = e.target.value as "all" | "track";
            })
          }
        >
          <option value="all">All tracks</option>
          <option value="track">Active track</option>
        </select>
        <select
          aria-label="Insertion mode"
          value={insertMode}
          onChange={(e) => setInsertMode(e.target.value as InsertMode)}
        >
          <option value="smart">Smart insert</option>
          <option value="normal">Normal insert</option>
          <option value="overwrite">Overwrite insert</option>
          <option value="ripple">Ripple insert</option>
        </select>
        <div className="toolbar-spacer" />
        <label className="zoom">
          Zoom{" "}
          <input
            aria-label="Timeline zoom"
            type="range"
            min="20"
            max="240"
            value={zoom}
            onChange={(e) => useEditor.setState({ zoom: +e.target.value })}
          />
        </label>
        <select
          aria-label="Add track"
          value=""
          onChange={(e) => {
            if (e.target.value) s.addTrack(e.target.value as Track["type"]);
          }}
        >
          <option value="">+ Track</option>
          <option value="video">Video layer</option>
          <option value="audio">Audio track</option>
          <option value="subtitle">Subtitle track</option>
        </select>
      </div>
      <div
        className="timeline-scroll"
        tabIndex={-1}
        ref={scroll}
        onScroll={(e) =>
          setViewport({
            left: e.currentTarget.scrollLeft,
            width: e.currentTarget.clientWidth,
          })
        }
      >
        <div className="timeline-content" style={{ width: width + 176 }}>
          <div className="ruler-row">
            <div className="track-head ruler-label">
              TRACKS <small>{project.tracks.length}</small>
            </div>
            <div
              ref={ruler}
              className="ruler"
              style={{ width }}
              onPointerDown={seek}
            >
              {Array.from(
                { length: Math.ceil(length / interval) + 1 },
                (_, i) => i * interval,
              )
                .filter(
                  (t) =>
                    t * zoom >= viewport.left - 100 &&
                    t * zoom <= viewport.left + viewport.width,
                )
                .map((t) => (
                  <span key={t} style={{ left: t * zoom }}>
                    {formatTime(t * SECOND).slice(0, 5)}
                  </span>
                ))}
              {(project.markers ?? []).map((marker) => (
                <button
                  key={marker.id}
                  className="timeline-marker"
                  style={{ left: seconds(marker.time) * zoom }}
                  title={`${marker.name}: click to seek, right-click to remove`}
                  aria-label={`Seek ${marker.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => s.seek(marker.time)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    s.transact((p) => {
                      p.markers = p.markers?.filter((m) => m.id !== marker.id);
                    });
                  }}
                >
                  <Flag size={12} />
                </button>
              ))}
            </div>
          </div>
          {!project.tracks.some((t) => t.type === "video") &&
            creationZone("video")}
          {project.tracks.map((track, index) => (
            <Fragment key={track.id}>
              {index === project.tracks.findIndex((t) => t.type === "video") &&
                creationZone("video")}
              <div
                className={`track-row ${s.activeTrack === track.id ? "active-track" : ""}`}
                key={track.id}
                data-track-id={track.id}
              >
                <div
                  className="track-head"
                  onClick={() => useEditor.setState({ activeTrack: track.id })}
                >
                  <input
                    className="track-name"
                    aria-label={`Rename ${track.name}`}
                    defaultValue={track.name}
                    key={track.name}
                    onBlur={(e) => {
                      if (e.target.value !== track.name)
                        trackEdit(track, (t) => {
                          t.name = e.target.value;
                        });
                    }}
                  />
                  <small className="track-type">
                    {track.type.toUpperCase()}
                  </small>
                  <div className="track-buttons">
                    <button
                      title={track.locked ? "Unlock track" : "Lock track"}
                      onClick={() =>
                        trackEdit(
                          track,
                          (t) => {
                            t.locked = !t.locked;
                          },
                          true,
                        )
                      }
                    >
                      {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <button
                      title={track.muted ? "Unmute track" : "Mute track"}
                      onClick={() =>
                        trackEdit(track, (t) => {
                          t.muted = !t.muted;
                        })
                      }
                    >
                      {track.muted ? (
                        <VolumeX size={13} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                    </button>
                    {track.type !== "audio" && (
                      <button
                        title={track.visible ? "Hide track" : "Show track"}
                        onClick={() =>
                          trackEdit(track, (t) => {
                            t.visible = !t.visible;
                          })
                        }
                      >
                        {track.visible ? (
                          <Eye size={13} />
                        ) : (
                          <EyeOff size={13} />
                        )}
                      </button>
                    )}
                    <button
                      title="Move track up"
                      disabled={index === 0 || track.locked}
                      onClick={() =>
                        s.transact((p) => {
                          [p.tracks[index - 1], p.tracks[index]] = [
                            p.tracks[index],
                            p.tracks[index - 1],
                          ];
                        })
                      }
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      title="Move track down"
                      disabled={
                        index === project.tracks.length - 1 || track.locked
                      }
                      onClick={() =>
                        s.transact((p) => {
                          [p.tracks[index + 1], p.tracks[index]] = [
                            p.tracks[index],
                            p.tracks[index + 1],
                          ];
                        })
                      }
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      title={
                        track.locked
                          ? "Unlock track before deleting"
                          : "Delete track"
                      }
                      disabled={track.locked || project.tracks.length === 1}
                      onClick={() => {
                        if (
                          !track.clips.length ||
                          window.confirm(
                            `Delete "${track.name}" and its ${track.clips.length} clips? Linked clips on other tracks will stay in place and become unlinked.`,
                          )
                        )
                          s.edit({ type: "deleteTrack", trackId: track.id });
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div
                  className={`track-lane ${track.locked ? "locked-lane" : ""}`}
                  style={{ width }}
                  onPointerDown={(e) => selectArea(e, track)}
                  onDragOver={(e) => libraryDrag(e, track)}
                  onDrop={(e) => libraryDrag(e, track, undefined, true)}
                >
                  {drag?.clips
                    .filter((c) => c.trackId === track.id)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="drag-ghost"
                        style={{
                          left: seconds(c.timelineStart) * zoom,
                          width: seconds(c.timelineDuration) * zoom,
                        }}
                      >
                        {c.name} / {formatTime(c.timelineStart)}
                      </div>
                    ))}
                  {!track.clips.length && (
                    <span className="track-empty">
                      {track.type === "subtitle"
                        ? "Add captions from Text panel"
                        : `Drop ${track.type} here`}
                    </span>
                  )}
                  {track.clips
                    .filter(
                      (c) =>
                        seconds(end(c)) * zoom >= viewport.left - 300 &&
                        seconds(c.timelineStart) * zoom <=
                          viewport.left + viewport.width + 300,
                    )
                    .map((c) => {
                      const asset = project.mediaAssets.find(
                          (a) => a.id === c.mediaAssetId,
                        ),
                        selected = s.selection.includes(c.id);
                      return (
                        <div
                          tabIndex={0}
                          role="button"
                          aria-label={`Clip ${c.name}`}
                          aria-pressed={selected}
                          data-clip-id={c.id}
                          key={c.id}
                          className={`clip clip-${track.type} ${selected ? "selected" : ""} ${asset?.missing ? "missing" : ""}`}
                          style={{
                            left: seconds(c.timelineStart) * zoom,
                            width: Math.max(
                              4,
                              seconds(c.timelineDuration) * zoom,
                            ),
                          }}
                          onPointerDown={(e) => pointer(e, c)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") s.select(c.id, e.shiftKey);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            s.select(c.id);
                            setMenu({
                              x: Math.min(e.clientX, window.innerWidth - 190),
                              y: Math.min(e.clientY, window.innerHeight - 370),
                              id: c.id,
                            });
                          }}
                        >
                          {asset?.thumbnail && track.type === "video" && (
                            <img
                              draggable={false}
                              src={asset.thumbnail}
                              alt=""
                            />
                          )}
                          <span className="clip-name">
                            {c.groupId && <Link size={10} />}{" "}
                            {c.text?.text ?? c.name}
                          </span>
                          {asset?.waveform && (
                            <ClipWaveform
                              asset={asset}
                              clip={c}
                              zoom={zoom}
                              viewport={viewport}
                            />
                          )}
                          <span className="clip-duration">
                            {seconds(c.timelineDuration).toFixed(1)}s
                            {c.playbackSpeed !== 1
                              ? ` / ${c.playbackSpeed}x`
                              : ""}
                          </span>
                          <div
                            className="trim-handle start"
                            title="Trim start"
                            onPointerDown={(e) => pointer(e, c, "start")}
                          />
                          <div
                            className="trim-handle end"
                            title="Trim end"
                            onPointerDown={(e) => pointer(e, c, "end")}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
              {index ===
                project.tracks.map((t) => t.type).lastIndexOf("audio") &&
                creationZone("audio")}
            </Fragment>
          ))}
          {!project.tracks.some((t) => t.type === "audio") &&
            creationZone("audio")}
          {marquee && (
            <div
              className="selection-marquee"
              style={{
                left: marquee.left,
                top: marquee.top,
                width: marquee.right - marquee.left,
                height: marquee.bottom - marquee.top,
              }}
            />
          )}
          {magnet && (
            <div
              className="snap-guide"
              style={{ left: 176 + seconds(magnet.time) * zoom }}
            >
              <span>{magnet.label}</span>
            </div>
          )}
          <div
            className="playhead"
            style={{
              left: 176 + seconds(s.playhead) * zoom,
              bottom: 0,
            }}
          >
            <button
              className="playhead-handle"
              aria-label="Timeline playhead"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration(project)}
              aria-valuenow={s.playhead}
              aria-valuetext={formatTime(s.playhead)}
              onPointerDown={seek}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  s.seek(
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? duration(project)
                        : s.playhead +
                          ((e.key === "ArrowLeft" ? -1 : 1) * SECOND) /
                            project.frameRate,
                  );
                }
              }}
            />
          </div>
        </div>
      </div>
      {drag && (
        <div
          role="status"
          className={`drag-feedback ${drag.error ? "invalid" : ""}`}
          style={{
            left: Math.min(drag.x + 12, window.innerWidth - 330),
            top: drag.y - 36,
          }}
        >
          {drag.error ?? drag.label ?? "Release to apply / Esc to cancel"}
        </div>
      )}
      {menu && (
        <div className="context-backdrop" onPointerDown={() => setMenu(null)}>
          <div
            role="menu"
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              onClick={() => {
                s.edit({ type: "split", ids: [menu.id], at: s.playhead });
                setMenu(null);
              }}
            >
              Split at playhead
            </button>
            <button
              role="menuitem"
              onClick={() => {
                s.copy();
                setMenu(null);
              }}
            >
              Copy
            </button>
            <button
              role="menuitem"
              onClick={() => {
                s.duplicate();
                setMenu(null);
              }}
            >
              Duplicate
            </button>
            <button
              role="menuitem"
              onClick={() => {
                s.edit({ type: "delete", ids: [menu.id] });
                setMenu(null);
              }}
            >
              Delete {project.settings.ripple ? "with ripple" : ""}
            </button>
            {["Separate linked audio", "Unlink Audio", "Extract Audio"].map(
              (label) => (
                <button
                  key={label}
                  role="menuitem"
                  onClick={() => {
                    const clip = project.tracks
                      .flatMap((t) => t.clips)
                      .find((c) => c.id === menu.id)!;
                    if (
                      label === "Unlink Audio" &&
                      clip.groupId &&
                      (clip.audioEnabled === false ||
                        project.tracks.find((t) => t.id === clip.trackId)
                          ?.type === "audio")
                    )
                      s.edit({ type: "link", ids: [clip.id], unlink: true });
                    else
                      s.edit({
                        type: "separateAudio",
                        id: clip.id,
                        linked: label === "Separate linked audio",
                      });
                    setMenu(null);
                  }}
                >
                  {label}
                </button>
              ),
            )}
            <button
              role="menuitem"
              disabled={
                !project.tracks
                  .flatMap((t) => t.clips)
                  .some(
                    (c) =>
                      c.id === menu.id &&
                      c.audioEnabled !== false &&
                      project.mediaAssets.some(
                        (a) => a.id === c.mediaAssetId && a.hasAudio,
                      ),
                  )
              }
              onClick={() => {
                const clip = project.tracks
                  .flatMap((t) => t.clips)
                  .find((c) => c.id === menu.id)!;
                s.edit({
                  type: "patch",
                  ids: [clip.id],
                  patch: { muted: !clip.muted },
                });
                setMenu(null);
              }}
            >
              {project.tracks
                .flatMap((t) => t.clips)
                .find((c) => c.id === menu.id)?.muted
                ? "Unmute Clip"
                : "Mute Clip"}
            </button>
            <button role="menuitem" onClick={() => setMenu(null)}>
              Close menu
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
