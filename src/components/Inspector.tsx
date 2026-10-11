import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, effectiveProject } from "../stores/editor";
import { editProject, type Edit } from "../editor/timeline";
import { end, seconds, ticks, type Clip } from "../editor/model";
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  transaction,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => boolean | void;
  min?: number;
  max?: number;
  step?: number;
  transaction?: string;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false),
    cancelled = useRef(false),
    initialValue = useRef(value);
  useEffect(() => {
    if (!focused.current) setDraft(String(Number(value.toFixed(4))));
  }, [value]);
  const apply = (raw: string, final = false) => {
    const next = Number(raw);
    if (
      !raw.trim() ||
      !Number.isFinite(next) ||
      (!final && !/^-?(?:\d+|\d*\.\d+)$/.test(raw)) ||
      (min !== undefined && next < min) ||
      (max !== undefined && next > max)
    ) {
      setInvalid(true);
      return false;
    }
    if (transaction) useEditor.getState().beginInteractive(transaction);
    const valid = next === Number(value.toFixed(4)) || onChange(next) !== false;
    setInvalid(!valid);
    return valid;
  };
  return (
    <label className="field">
      <span>
        {label}
        {unit && <small>{unit}</small>}
      </span>
      <input
        aria-label={label}
        role="spinbutton"
        inputMode="decimal"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={invalid}
        value={draft}
        onFocus={() => {
          focused.current = true;
          cancelled.current = false;
          initialValue.current = value;
          if (transaction) useEditor.getState().beginInteractive(transaction);
        }}
        onChange={(e) => {
          cancelled.current = false;
          setDraft(e.target.value);
          apply(e.target.value);
        }}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) return;
          if (apply(draft, true)) {
            if (transaction) useEditor.getState().commitInteractive();
          } else {
            if (transaction) useEditor.getState().cancelInteractive();
            useEditor.setState({
              error: `${label}: enter a valid value${min !== undefined && max !== undefined ? ` from ${min} to ${max}` : ""}.`,
            });
            setDraft(String(Number(value.toFixed(4))));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            if (transaction) useEditor.getState().cancelInteractive();
            focused.current = false;
            setInvalid(false);
            setDraft(String(Number(initialValue.current.toFixed(4))));
            e.currentTarget.blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.min(
              max ?? Infinity,
              Math.max(
                min ?? -Infinity,
                value + (e.key === "ArrowUp" ? step : -step),
              ),
            );
            setDraft(String(Number(n.toFixed(4))));
            apply(String(n));
          }
        }}
      />
    </label>
  );
}
function PropertyRange({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  transaction,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => unknown;
  transaction: string;
}) {
  const cancelled = useRef(false);
  return (
    <label className="property-range">
      <span>{label.replace(" slider", "")}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => {
          cancelled.current = false;
          useEditor.getState().beginInteractive(transaction);
        }}
        onChange={(e) => {
          if (cancelled.current) return;
          useEditor.getState().beginInteractive(transaction);
          onChange(+e.target.value);
        }}
        onPointerUp={() => useEditor.getState().commitInteractive()}
        onPointerCancel={() => {
          cancelled.current = true;
          useEditor.getState().cancelInteractive();
        }}
        onLostPointerCapture={() => {
          if (useEditor.getState().interactive?.key === transaction)
            useEditor.getState().cancelInteractive();
        }}
        onBlur={() => useEditor.getState().commitInteractive()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            useEditor.getState().cancelInteractive();
          } else {
            cancelled.current = false;
            useEditor.getState().beginInteractive(transaction);
          }
        }}
        onKeyUp={(e) => {
          if (e.key !== "Escape") useEditor.getState().commitInteractive();
        }}
      />
    </label>
  );
}
function Section({
  title,
  children,
  reset,
}: {
  title: string;
  children: ReactNode;
  reset?: () => void;
}) {
  return (
    <details className="inspector-section" open>
      <summary>
        {title}
        {reset && (
          <button
            type="button"
            aria-label={`Reset ${title}`}
            title={`Reset ${title}`}
            onClick={(e) => {
              e.preventDefault();
              reset();
            }}
          >
            Reset
          </button>
        )}
      </summary>
      <div className="inspector-section-body">{children}</div>
    </details>
  );
}
function CaptionField({ clip }: { clip: Clip }) {
  const [draft, setDraft] = useState(clip.text!.text),
    focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(clip.text!.text);
  }, [clip.text!.text]);
  return (
    <textarea
      aria-label="Caption text"
      value={draft}
      onFocus={() => {
        focused.current = true;
        useEditor.getState().beginInteractive(`${clip.id}:caption`);
      }}
      onChange={(e) => {
        const value = e.target.value;
        setDraft(value);
        if (value.trim()) {
          useEditor.getState().beginInteractive(`${clip.id}:caption`);
          useEditor.getState().updateInteractive((p) => {
            p.tracks
              .flatMap((t) => t.clips)
              .find((c) => c.id === clip.id)!.text!.text = value;
          });
        }
      }}
      onBlur={() => {
        focused.current = false;
        if (draft.trim()) useEditor.getState().commitInteractive();
        else {
          useEditor.getState().cancelInteractive();
          setDraft(
            useEditor
              .getState()
              .project.tracks.flatMap((t) => t.clips)
              .find((c) => c.id === clip.id)!.text!.text,
          );
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          useEditor.getState().cancelInteractive();
          setDraft(
            useEditor
              .getState()
              .project.tracks.flatMap((t) => t.clips)
              .find((c) => c.id === clip.id)!.text!.text,
          );
        }
      }}
    />
  );
}
export function Inspector() {
  const state = useEditor(),
    s = { ...state, project: effectiveProject(state) },
    clip = s.project.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === s.selection[0]);
  if (!clip)
    return (
      <aside className="inspector">
        <div className="panel-title">PROJECT</div>
        <div className="inspector-content">
          <div className="inspector-empty">
            <span className="empty-mark">S/</span>
            <h3>Make every cut count.</h3>
            <p>Select a clip to adjust timing, picture, sound, or text.</p>
          </div>
          <h4>Canvas</h4>
          <p>
            {s.project.resolution.width} x {s.project.resolution.height}
            <br />
            {s.project.frameRate} frames / second
          </p>
          <h4>Editing</h4>
          <p>
            Drag clip edges to trim.
            <br />
            Ctrl+B splits at playhead.
            <br />
            Ripple shifts downstream clips.
          </p>
          <div className="note">All processing stays on this computer.</div>
        </div>
      </aside>
    );
  const track = s.project.tracks.find((t) => t.id === clip.trackId)!,
    asset = s.project.mediaAssets.find((a) => a.id === clip.mediaAssetId);
  const apply = (command: Edit) =>
    useEditor.getState().interactive
      ? useEditor.getState().updateInteractive((p) => editProject(p, command))
      : useEditor.getState().edit(command);
  const patch = (patch: Partial<Clip>) =>
    apply({ type: "patch", ids: [clip.id], patch });
  const numeric = (label: string) => `${clip.id}:${label}`;
  const reset = (patch: Partial<Clip>) => {
    useEditor.getState().commitInteractive();
    useEditor.getState().edit({ type: "patch", ids: [clip.id], patch });
  };
  const transform = (key: keyof Clip["transform"], value: number | boolean) =>
    patch({ transform: { ...clip.transform, [key]: value } });
  const text = (
    key: keyof NonNullable<Clip["text"]>,
    value: string | number | boolean,
  ) => patch({ text: { ...clip.text!, [key]: value } });
  return (
    <aside className="inspector">
      <div className="panel-title">
        <span>INSPECTOR</span>
        <span className="badge">
          {clip.text ? "TEXT" : track.type.toUpperCase()}
        </span>
      </div>
      <fieldset
        key={clip.id}
        className="inspector-content"
        disabled={track.locked}
      >
        <input
          className="inspector-name"
          aria-label="Clip name"
          key={`${clip.id}-${clip.name}`}
          defaultValue={clip.name}
          onBlur={(e) => {
            if (e.target.value !== clip.name) patch({ name: e.target.value });
          }}
        />
        {track.locked && <p className="note">Unlock track to edit.</p>}
        {s.selection.length > 1 && (
          <p className="note">
            {s.selection.length} clips selected. Properties apply to first clip;
            linked timing stays synchronized.
          </p>
        )}
        {track.type !== "audio" && (
          <>
            <Section
              title="Basic"
              reset={() =>
                reset({
                  transform: {
                    ...clip.transform,
                    x: 0,
                    y: 0,
                    scale: 1,
                    rotation: 0,
                    flipX: false,
                    flipY: false,
                  },
                  opacity: 1,
                })
              }
            >
              <div className="field-grid">
                <NumberField
                  transaction={numeric("properties")}
                  label="Position X"
                  unit="px"
                  value={clip.transform.x}
                  min={-7680}
                  max={7680}
                  onChange={(n) => transform("x", n)}
                />
                <NumberField
                  transaction={numeric("properties")}
                  label="Position Y"
                  unit="px"
                  value={clip.transform.y}
                  min={-7680}
                  max={7680}
                  onChange={(n) => transform("y", n)}
                />
                <NumberField
                  transaction={numeric("properties")}
                  label="Scale (%)"
                  value={clip.transform.scale * 100}
                  min={10}
                  max={400}
                  onChange={(n) => transform("scale", n / 100)}
                />
                <NumberField
                  transaction={numeric("properties")}
                  label="Rotation"
                  unit="deg"
                  value={clip.transform.rotation}
                  min={-180}
                  max={180}
                  onChange={(n) => transform("rotation", n)}
                />
                <NumberField
                  transaction={numeric("properties")}
                  label="Opacity (%)"
                  value={clip.opacity * 100}
                  min={0}
                  max={100}
                  onChange={(n) => patch({ opacity: n / 100 })}
                />
              </div>
              {!clip.text && (
                <div className="check-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={clip.transform.flipX}
                      onChange={(e) => transform("flipX", e.target.checked)}
                    />{" "}
                    Flip X
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={clip.transform.flipY}
                      onChange={(e) => transform("flipY", e.target.checked)}
                    />{" "}
                    Flip Y
                  </label>
                </div>
              )}
              <PropertyRange
                label="Scale slider"
                value={clip.transform.scale * 100}
                min={10}
                max={400}
                transaction={numeric("scale")}
                onChange={(n) => transform("scale", n / 100)}
              />
              <PropertyRange
                label="Opacity slider"
                value={clip.opacity * 100}
                min={0}
                max={100}
                transaction={numeric("opacity")}
                onChange={(n) => patch({ opacity: n / 100 })}
              />
            </Section>
            {!clip.text && (
              <Section
                title="Crop"
                reset={() =>
                  reset({ transform: { ...clip.transform, crop: undefined } })
                }
              >
                <p className="muted">
                  Free crop. Percent of fitted source; reveals lower layers.
                </p>
                <div className="field-grid">
                  {(["left", "right", "top", "bottom"] as const).map((edge) => (
                    <NumberField
                      transaction={numeric("properties")}
                      key={edge}
                      label={`Crop ${edge} (%)`}
                      value={(clip.transform.crop?.[edge] ?? 0) * 100}
                      min={0}
                      max={99}
                      onChange={(n) =>
                        patch({
                          transform: {
                            ...clip.transform,
                            crop: {
                              left: 0,
                              right: 0,
                              top: 0,
                              bottom: 0,
                              ...clip.transform.crop,
                              [edge]: n / 100,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        {clip.text && (
          <>
            <Section title="Text style">
              <CaptionField key={clip.id} clip={clip} />
              <label className="field">
                <span>Style preset</span>
                <select
                  aria-label="Subtitle preset"
                  defaultValue=""
                  onChange={(e) => {
                    const styles = [
                      {
                        size: 64,
                        color: "#ffffff",
                        outline: 2,
                        shadow: 0,
                        background: false,
                      },
                      {
                        size: 80,
                        color: "#ffffff",
                        outline: 5,
                        shadow: 2,
                        background: false,
                      },
                      {
                        size: 76,
                        color: "#ffe16b",
                        outline: 4,
                        shadow: 1,
                        background: false,
                      },
                      {
                        size: 56,
                        color: "#f4f0e8",
                        outline: 1,
                        shadow: 0,
                        background: true,
                      },
                      {
                        size: 84,
                        color: "#b7ff52",
                        outline: 6,
                        shadow: 2,
                        background: true,
                      },
                    ];
                    const style = styles[+e.target.value];
                    if (style)
                      patch({
                        text: {
                          ...clip.text!,
                          ...style,
                          size: Math.round(
                            (style.size * s.project.resolution.width) / 1080,
                          ),
                        },
                      });
                  }}
                >
                  <option value="" disabled>
                    Choose preset
                  </option>
                  {[
                    "Minimal white",
                    "Bold creator",
                    "Yellow emphasis",
                    "Documentary",
                    "High contrast",
                  ].map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Font</span>
                <select
                  aria-label="Font"
                  value={clip.text.font}
                  onChange={(e) => text("font", e.target.value)}
                >
                  {[
                    "Arial",
                    "Segoe UI",
                    "Georgia",
                    "Verdana",
                    "Tahoma",
                    "Courier New",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <div className="field-grid">
                <NumberField
                  transaction={numeric("properties")}
                  label="Font size"
                  value={clip.text.size}
                  min={8}
                  max={300}
                  onChange={(n) => text("size", n)}
                />
                <label className="field">
                  <span>Text color</span>
                  <input
                    aria-label="Text color"
                    type="color"
                    value={clip.text.color}
                    onFocus={() => s.beginInteractive(numeric("color"))}
                    onChange={(e) => {
                      s.beginInteractive(numeric("color"));
                      text("color", e.target.value);
                    }}
                    onBlur={() => s.commitInteractive()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") s.cancelInteractive();
                    }}
                  />
                </label>
                <NumberField
                  transaction={numeric("properties")}
                  label="Outline"
                  value={clip.text.outline}
                  min={0}
                  max={10}
                  onChange={(n) => text("outline", n)}
                />
                <NumberField
                  transaction={numeric("properties")}
                  label="Shadow"
                  value={clip.text.shadow}
                  min={0}
                  max={10}
                  onChange={(n) => text("shadow", n)}
                />
              </div>
              <label className="field">
                <span>Alignment</span>
                <select
                  aria-label="Text alignment"
                  value={clip.text.align}
                  onChange={(e) => text("align", e.target.value)}
                >
                  <option>left</option>
                  <option>center</option>
                  <option>right</option>
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={clip.text.background}
                  onChange={(e) => text("background", e.target.checked)}
                />{" "}
                Caption background
              </label>
            </Section>
          </>
        )}
        {asset?.hasAudio && (
          <>
            <Section
              title="Audio"
              reset={() => reset({ volume: 1, muted: false })}
            >
              {clip.audioEnabled === false && (
                <p className="note">
                  Sound is on the extracted audio clip. Select it to adjust its
                  gain.
                </p>
              )}
              {clip.audioEnabled !== false && (
                <>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={!!clip.muted}
                      onChange={(e) => patch({ muted: e.target.checked })}
                    />{" "}
                    Mute clip
                  </label>
                  <div className="field-grid">
                    <NumberField
                      transaction={numeric("properties")}
                      label="Clip gain (dB)"
                      value={
                        clip.volume > 0
                          ? Math.max(-60, 20 * Math.log10(clip.volume))
                          : -60
                      }
                      min={-60}
                      max={20 * Math.log10(2)}
                      step={0.1}
                      onChange={(n) =>
                        patch({
                          volume: n <= -60 ? 0 : Math.min(2, 10 ** (n / 20)),
                        })
                      }
                    />
                  </div>
                </>
              )}
              <NumberField
                transaction={numeric("properties")}
                label="Track gain (dB)"
                value={
                  (track.volume ?? 1) > 0
                    ? Math.max(-60, 20 * Math.log10(track.volume ?? 1))
                    : -60
                }
                min={-60}
                max={20 * Math.log10(2)}
                step={0.1}
                onChange={(n) =>
                  (useEditor.getState().interactive
                    ? s.updateInteractive
                    : s.transact)((p) => {
                    p.tracks.find((t) => t.id === track.id)!.volume =
                      n <= -60 ? 0 : Math.min(2, 10 ** (n / 20));
                  })
                }
              />
              <p className="muted">
                Track gain applies to all sound on {track.name}. -60 dB means
                silence.
              </p>
              {clip.audioEnabled !== false && (
                <>
                  <NumberField
                    transaction={numeric("properties")}
                    label="Volume (%)"
                    value={clip.volume * 100}
                    min={0}
                    max={200}
                    onChange={(n) => patch({ volume: n / 100 })}
                  />
                  <PropertyRange
                    label="Volume slider"
                    value={clip.volume * 100}
                    min={0}
                    max={200}
                    transaction={numeric("volume")}
                    onChange={(n) => patch({ volume: n / 100 })}
                  />
                </>
              )}
            </Section>
          </>
        )}
        <Section title="Speed & timing">
          <div className="field-grid">
            <NumberField
              transaction={numeric("properties")}
              label="Start (s)"
              value={seconds(clip.timelineStart)}
              min={0}
              step={1 / s.project.frameRate}
              onChange={(n) =>
                apply({
                  type: "move",
                  ids: [clip.id],
                  delta: ticks(n) - clip.timelineStart,
                })
              }
            />
            <NumberField
              transaction={numeric("properties")}
              label="End (s)"
              value={seconds(end(clip))}
              min={0}
              step={1 / s.project.frameRate}
              onChange={(n) =>
                apply({ type: "trim", id: clip.id, edge: "end", at: ticks(n) })
              }
            />
            <NumberField
              transaction={numeric("properties")}
              label="Trim start (s)"
              value={seconds(clip.timelineStart)}
              min={0}
              step={1 / s.project.frameRate}
              onChange={(n) =>
                apply({
                  type: "trim",
                  id: clip.id,
                  edge: "start",
                  at: ticks(n),
                })
              }
            />
            <NumberField
              transaction={numeric("properties")}
              label="Speed"
              value={clip.playbackSpeed}
              min={0.25}
              max={4}
              step={0.25}
              onChange={(speed) => apply({ type: "speed", id: clip.id, speed })}
            />
          </div>
          <small className="muted">
            Source {seconds(clip.sourceIn).toFixed(2)} -{" "}
            {seconds(clip.sourceOut).toFixed(2)}s
          </small>
        </Section>
        <Section title="Fades" reset={() => reset({ fadeIn: 0, fadeOut: 0 })}>
          <p className="muted">Applies to picture and sound.</p>
          <div className="field-grid">
            <NumberField
              transaction={numeric("properties")}
              label="Fade in (s)"
              value={seconds(clip.fadeIn)}
              min={0}
              max={seconds(clip.timelineDuration)}
              step={0.1}
              onChange={(n) => patch({ fadeIn: ticks(n) })}
            />
            <NumberField
              transaction={numeric("properties")}
              label="Fade out (s)"
              value={seconds(clip.fadeOut)}
              min={0}
              max={seconds(clip.timelineDuration)}
              step={0.1}
              onChange={(n) => patch({ fadeOut: ticks(n) })}
            />
          </div>
        </Section>
        {asset && (
          <Section title="Source">
            <p className="source-path">{asset.path}</p>
            <small>
              {asset.width} x {asset.height} / {asset.frameRate.toFixed(2)} FPS
            </small>
          </Section>
        )}
      </fieldset>
    </aside>
  );
}
