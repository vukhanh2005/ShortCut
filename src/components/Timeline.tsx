import { useRef, useState } from "react";
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
} from "lucide-react";
import { useEditor } from "../stores/editor";
import {
  type Clip,
  type Track,
  SECOND,
  duration,
  end,
  seconds,
  ticks,
  formatTime,
  quantize,
} from "../editor/model";
import { snap } from "../editor/timeline";
export function Timeline() {
  const s = useEditor(),
    { project, zoom } = s;
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
  const pointer = (
    e: React.PointerEvent,
    clip: Clip,
    edge?: "start" | "end",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!s.selection.includes(clip.id))
      s.select(clip.id, e.shiftKey || e.ctrlKey);
    else if (e.shiftKey || e.ctrlKey) {
      s.select(clip.id, true);
      return;
    }
    if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return;
    const start = e.clientX,
      element = e.currentTarget as HTMLElement;
    const target = edge ? element.parentElement! : element;
    let dx = 0;
    const move = (event: PointerEvent) => {
      dx = event.clientX - start;
      target.style.translate = `${dx}px 0`;
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      target.style.translate = "";
      if (Math.abs(dx) < 3) return;
      const now = useEditor.getState(),
        ids = now.selection.includes(clip.id) ? now.selection : [clip.id];
      const at = snap(
        now.project,
        (edge === "end" ? end(clip) : clip.timelineStart) + ticks(dx / zoom),
        now.playhead,
        ids,
        ticks(8 / zoom),
      );
      if (edge) now.edit({ type: "trim", id: clip.id, edge, at });
      else {
        const row = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-track-id]");
        now.edit({
          type: "move",
          ids,
          delta: at - clip.timelineStart,
          trackId: ids.length === 1 ? row?.dataset.trackId : undefined,
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    s.seek(quantize(project, ticks((e.clientX - rect.left) / zoom)));
  };
  const drop = (event: React.DragEvent, track: Track) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/shortcut-asset");
    const asset = project.mediaAssets.find((a) => a.id === id);
    if (!asset) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const at = snap(
      project,
      ticks((event.clientX - rect.left) / zoom),
      s.playhead,
      [],
      ticks(8 / zoom),
    );
    s.addAsset(asset, track.id, at);
  };
  return (
    <section className="timeline-panel" aria-label="Timeline">
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
          title="Link synchronized clips"
          disabled={s.selection.length < 2}
          onClick={() => s.edit({ type: "link", ids: s.selection })}
        >
          <Link size={16} />
        </button>
        <button
          title="Unlink clips"
          disabled={!s.selection.length}
          onClick={() =>
            s.edit({ type: "link", ids: s.selection, unlink: true })
          }
        >
          <Unlink size={16} />
        </button>
        <span className="toolbar-divider" />
        <button
          className={project.settings.snapping ? "active" : ""}
          title="Toggle snapping"
          aria-pressed={project.settings.snapping}
          onClick={() =>
            s.transact((p) => {
              p.settings.snapping = !p.settings.snapping;
            })
          }
        >
          <Magnet size={16} />
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={project.settings.ripple}
            onChange={(e) =>
              s.transact((p) => {
                p.settings.ripple = e.target.checked;
              })
            }
          />{" "}
          Ripple
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
            <div className="ruler" style={{ width }} onPointerDown={seek}>
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
            </div>
          </div>
          {project.tracks.map((track, index) => (
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
                      {track.visible ? <Eye size={13} /> : <EyeOff size={13} />}
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
                    title="Delete empty track"
                    disabled={
                      !!track.clips.length ||
                      track.locked ||
                      project.tracks.length === 1
                    }
                    onClick={() =>
                      s.transact((p) => {
                        p.tracks = p.tracks.filter((t) => t.id !== track.id);
                      })
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div
                className={`track-lane ${track.locked ? "locked-lane" : ""}`}
                style={{ width }}
                onPointerDown={(e) => {
                  seek(e);
                  useEditor.setState({ selection: [], activeTrack: track.id });
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, track)}
              >
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
                            y: Math.min(e.clientY, window.innerHeight - 200),
                            id: c.id,
                          });
                        }}
                      >
                        {asset?.thumbnail && track.type === "video" && (
                          <img draggable={false} src={asset.thumbnail} alt="" />
                        )}
                        <span className="clip-name">
                          {c.groupId && <Link size={10} />}{" "}
                          {c.text?.text ?? c.name}
                        </span>
                        {asset?.waveform && (
                          <svg
                            className="waveform"
                            viewBox="0 0 256 32"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <path
                              d={Array.from({ length: 128 }, (_, i) => {
                                const source =
                                  c.sourceIn +
                                  (i / 128) * (c.sourceOut - c.sourceIn);
                                const value =
                                  asset.waveform![
                                    Math.min(
                                      255,
                                      Math.floor(
                                        (source / asset.duration) * 256,
                                      ),
                                    )
                                  ] ?? 0;
                                return `M${i * 2},${16 - value * 15}v${value * 30}`;
                              }).join(" ")}
                            />
                          </svg>
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
          ))}
          <div
            className="playhead"
            style={{
              left: 176 + seconds(s.playhead) * zoom,
              height: 32 + project.tracks.length * 76,
            }}
          >
            <span />
          </div>
        </div>
      </div>
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
            <button role="menuitem" onClick={() => setMenu(null)}>
              Close menu
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
