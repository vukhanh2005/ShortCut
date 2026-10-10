import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Scan,
} from "lucide-react";
import { useEditor } from "../stores/editor";
import {
  type Clip,
  type MediaAsset,
  type Project,
  duration,
  end,
  formatTime,
  seconds,
  frame,
} from "../editor/model";
import { fadeAt } from "../editor/timeline";
let audioContext: AudioContext | undefined;
const audioSources = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>();
function Player({
  clip,
  asset,
  muted,
  visual,
  project,
}: {
  clip: Clip;
  asset: MediaAsset;
  muted: boolean;
  visual: boolean;
  project: Project;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const gain = useRef<GainNode | null>(null);
  const time = useEditor((s) => s.playhead),
    playing = useEditor((s) => s.playing);
  const local = time - clip.timelineStart;
  const source = seconds(clip.sourceIn + local * clip.playbackSpeed);
  const ratio = Math.min(
    project.resolution.width / asset.width,
    project.resolution.height / asset.height,
  );
  useEffect(() => {
    const element = ref.current;
    if (!element || !asset.hasAudio) return;
    audioContext ??= new AudioContext();
    let source = audioSources.get(element);
    if (!source) {
      source = audioContext.createMediaElementSource(element);
      audioSources.set(element, source);
    }
    const node = audioContext.createGain();
    gain.current = node;
    source.connect(node);
    node.connect(audioContext.destination);
    return () => {
      source.disconnect();
      node.disconnect();
      gain.current = null;
    };
  }, [asset.hasAudio]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sync = () => {
      if (
        Math.abs(element.currentTime - source) >
        (playing ? Math.max(0.04, 1 / project.frameRate) : 0.005)
      )
        element.currentTime = source;
      element.playbackRate = clip.playbackSpeed;
      if (gain.current) {
        element.volume = 1;
        gain.current.gain.value = clip.volume * fadeAt(clip, local);
        if (playing) void audioContext?.resume();
      } else element.volume = Math.min(1, clip.volume * fadeAt(clip, local));
      element.muted = muted;
      if (playing && element.paused) element.play().catch(() => {});
      else if (!playing && !element.paused) element.pause();
    };
    sync();
    element.addEventListener("loadedmetadata", sync);
    return () => element.removeEventListener("loadedmetadata", sync);
  }, [source, playing, muted, clip, local]);
  const style = {
    width: asset.width * ratio,
    height: asset.height * ratio,
    left: project.resolution.width / 2 + clip.transform.x,
    top: project.resolution.height / 2 + clip.transform.y,
    transform: `translate(-50%,-50%) rotate(${clip.transform.rotation}deg) scale(${clip.transform.scale * (clip.transform.flipX ? -1 : 1)},${clip.transform.scale * (clip.transform.flipY ? -1 : 1)})`,
    opacity: clip.opacity * fadeAt(clip, local),
    display: visual ? undefined : "none",
  };
  if (asset.missing)
    return visual ? (
      <div className="missing-preview">Missing media: {asset.name}</div>
    ) : null;
  if (asset.type === "image")
    return (
      <img
        draggable={false}
        className="media-layer"
        src={asset.url}
        alt={asset.name}
        style={style}
      />
    );
  return (
    <video
      ref={ref}
      data-player
      className="media-layer"
      src={asset.url}
      crossOrigin="anonymous"
      style={style}
      preload="auto"
      playsInline
      onError={() => {
        useEditor.setState({
          playing: false,
          error: `Preview cannot decode ${asset.name}. Use Make proxy in the media library.`,
        });
      }}
    />
  );
}
export function Preview() {
  const { project, playhead, playing, selection } = useEditor();
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.25),
    [guides, setGuides] = useState(true);
  useEffect(() => {
    const element = box.current!;
    const observer = new ResizeObserver(([entry]) =>
      setFit(
        Math.min(
          (entry.contentRect.width - 48) / project.resolution.width,
          (entry.contentRect.height - 28) / project.resolution.height,
        ),
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.resolution]);
  const active = [...project.tracks]
    .reverse()
    .flatMap((track) =>
      track.clips
        .filter((c) => c.timelineStart <= playhead && end(c) > playhead)
        .map((clip) => ({
          clip,
          track,
          asset: project.mediaAssets.find((a) => a.id === clip.mediaAssetId),
        })),
    )
    .sort((a, b) => Number(!!a.clip.text) - Number(!!b.clip.text));
  const decoders = active.filter(
    ({ clip, asset, track }) =>
      !clip.text &&
      asset?.type !== "image" &&
      ((track.visible && track.type === "video" && clip.opacity > 0) ||
        (asset?.hasAudio && !track.muted && clip.volume > 0)),
  );
  const overLimit = decoders.length > 12;
  useEffect(() => {
    if (overLimit && playing)
      useEditor.setState({
        playing: false,
        error:
          "Preview supports 12 active media decoders. Mute or hide unused tracks.",
      });
  }, [overLimit, playing]);
  useEffect(() => {
    if (!playing) return;
    let request = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const state = useEditor.getState();
      const elapsed = Math.min(100, now - previous);
      previous = now;
      const ready = [
        ...document.querySelectorAll<HTMLVideoElement>("[data-player]"),
      ].every((v) => v.readyState >= 2 && !v.seeking);
      if (ready) {
        const next = state.playhead + Math.round(elapsed * 1000),
          total = duration(state.project);
        useEditor.setState({
          playhead: Math.min(next, total),
          playing: next < total,
        });
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing]);
  const toggle = () => {
    if (!duration(project)) return;
    useEditor.setState({
      playing: !playing,
      ...(playhead >= duration(project) ? { playhead: 0 } : {}),
    });
  };
  const moveVisual = (event: React.PointerEvent, clip: Clip) => {
    if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return;
    event.preventDefault();
    useEditor.getState().select(clip.id);
    const x = event.clientX,
      y = event.clientY,
      original = clip.transform;
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointerup", up);
      useEditor.getState().edit({
        type: "patch",
        ids: [clip.id],
        patch: {
          transform: {
            ...original,
            x: Math.round(original.x + (e.clientX - x) / fit),
            y: Math.round(original.y + (e.clientY - y) / fit),
          },
        },
      });
    };
    window.addEventListener("pointerup", up, { once: true });
  };
  return (
    <section className="preview-panel" aria-label="Preview">
      <div className="panel-title">
        <span>PLAYER</span>
        <span className="badge">
          {project.resolution.width} x {project.resolution.height}{" "}
          <b>{project.frameRate} FPS</b>
        </span>
        <button
          title="Toggle safe-area guides"
          aria-pressed={guides}
          onClick={() => setGuides(!guides)}
        >
          <Scan size={15} />
        </button>
      </div>
      <div className="preview-space" ref={box}>
        <div
          className="stage-wrapper"
          style={{
            width: project.resolution.width * fit,
            height: project.resolution.height * fit,
          }}
        >
          <div
            className="stage"
            style={{
              width: project.resolution.width,
              height: project.resolution.height,
              transform: `scale(${fit})`,
            }}
          >
            {!overLimit &&
              active.map(({ clip, track, asset }) =>
                clip.text
                  ? track.visible && (
                      <div
                        key={clip.id}
                        className={`text-layer ${selection.includes(clip.id) ? "selected-text" : ""}`}
                        onPointerDown={(e) => moveVisual(e, clip)}
                        style={{
                          left: project.resolution.width / 2 + clip.transform.x,
                          top: project.resolution.height / 2 + clip.transform.y,
                          transform: `translate(${clip.text.align === "left" ? "0" : clip.text.align === "right" ? "-100%" : "-50%"},-50%) rotate(${clip.transform.rotation}deg) scale(${clip.transform.scale})`,
                          opacity:
                            clip.opacity *
                            fadeAt(clip, playhead - clip.timelineStart),
                          fontFamily: clip.text.font,
                          fontSize: clip.text.size,
                          color: clip.text.color,
                          WebkitTextStroke: `${clip.text.outline}px #111`,
                          paintOrder: "stroke fill",
                          textShadow: `${clip.text.shadow}px ${clip.text.shadow}px ${clip.text.shadow * 2}px #111`,
                          background: clip.text.background
                            ? "#171411"
                            : undefined,
                          textAlign: clip.text.align,
                          maxWidth: project.resolution.width - 120,
                        }}
                      >
                        {clip.text.text}
                      </div>
                    )
                  : asset &&
                    ((track.visible &&
                      track.type === "video" &&
                      clip.opacity > 0) ||
                      (asset.hasAudio && !track.muted && clip.volume > 0)) && (
                      <Player
                        key={clip.id}
                        clip={clip}
                        asset={asset}
                        muted={track.muted}
                        visual={track.visible && track.type === "video"}
                        project={project}
                      />
                    ),
              )}
            {guides && <div className="safe-guide" />}
          </div>
          {!duration(project) && (
            <div className="preview-empty">
              <span>YOUR NEXT STORY</span>
              <p>Import media to begin</p>
            </div>
          )}
        </div>
      </div>
      <div className="playback">
        <span className="timecode">
          {formatTime(playhead)}{" "}
          <small>/ {formatTime(duration(project))}</small>
        </span>
        <div className="play-buttons">
          <button
            title="Jump to start (Home)"
            onClick={() => useEditor.getState().seek(0)}
          >
            <SkipBack size={16} />
          </button>
          <button
            title="Previous frame (Left)"
            onClick={() =>
              useEditor
                .getState()
                .seek(
                  frame(
                    project,
                    Math.round((playhead * project.frameRate) / 1e6) - 1,
                  ),
                )
            }
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="play-button"
            title="Play / pause (Space)"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <button
            title="Next frame (Right)"
            onClick={() =>
              useEditor
                .getState()
                .seek(
                  frame(
                    project,
                    Math.round((playhead * project.frameRate) / 1e6) + 1,
                  ),
                )
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <span className="fit-label">Fit {Math.round(fit * 100)}%</span>
      </div>
    </section>
  );
}
