import { useEditor } from "../stores/editor";
import { end, seconds, ticks, type Clip } from "../editor/model";
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        key={value}
        aria-label={label}
        type="number"
        defaultValue={Number(value.toFixed(4))}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          const value = e.target.valueAsNumber;
          if (Number.isFinite(value)) onChange(value);
          else useEditor.setState({ error: `${label} needs a number.` });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function Inspector() {
  const s = useEditor(),
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
  const patch = (patch: Partial<Clip>) =>
    s.edit({ type: "patch", ids: [clip.id], patch });
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
      <fieldset className="inspector-content" disabled={track.locked}>
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
        <h4>Timing</h4>
        <div className="field-grid">
          <NumberField
            label="Start (s)"
            value={seconds(clip.timelineStart)}
            min={0}
            step={1 / s.project.frameRate}
            onChange={(n) =>
              s.edit({
                type: "move",
                ids: [clip.id],
                delta: ticks(n) - clip.timelineStart,
              })
            }
          />
          <NumberField
            label="End (s)"
            value={seconds(end(clip))}
            min={0}
            step={1 / s.project.frameRate}
            onChange={(n) =>
              s.edit({ type: "trim", id: clip.id, edge: "end", at: ticks(n) })
            }
          />
          <NumberField
            label="Trim start (s)"
            value={seconds(clip.timelineStart)}
            min={0}
            step={1 / s.project.frameRate}
            onChange={(n) =>
              s.edit({ type: "trim", id: clip.id, edge: "start", at: ticks(n) })
            }
          />
          <NumberField
            label="Speed"
            value={clip.playbackSpeed}
            min={0.25}
            max={4}
            step={0.25}
            onChange={(speed) => s.edit({ type: "speed", id: clip.id, speed })}
          />
        </div>
        <small className="muted">
          Source {seconds(clip.sourceIn).toFixed(2)} -{" "}
          {seconds(clip.sourceOut).toFixed(2)}s
        </small>
        {track.type !== "audio" && (
          <>
            <h4>Transform</h4>
            <div className="field-grid">
              <NumberField
                label="Position X"
                value={clip.transform.x}
                min={-7680}
                max={7680}
                onChange={(n) => transform("x", n)}
              />
              <NumberField
                label="Position Y"
                value={clip.transform.y}
                min={-7680}
                max={7680}
                onChange={(n) => transform("y", n)}
              />
              <NumberField
                label="Scale (%)"
                value={clip.transform.scale * 100}
                min={10}
                max={400}
                onChange={(n) => transform("scale", n / 100)}
              />
              <NumberField
                label="Rotation"
                value={clip.transform.rotation}
                min={-180}
                max={180}
                onChange={(n) => transform("rotation", n)}
              />
              <NumberField
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
          </>
        )}
        {clip.text && (
          <>
            <h4>Caption</h4>
            <textarea
              aria-label="Caption text"
              key={`${clip.id}-${clip.text.text}`}
              defaultValue={clip.text.text}
              onBlur={(e) => {
                if (e.target.value !== clip.text!.text)
                  text("text", e.target.value);
              }}
            />
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
                  onChange={(e) => text("color", e.target.value)}
                />
              </label>
              <NumberField
                label="Outline"
                value={clip.text.outline}
                min={0}
                max={10}
                onChange={(n) => text("outline", n)}
              />
              <NumberField
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
          </>
        )}
        {asset?.hasAudio && (
          <>
            <h4>Audio</h4>
            <NumberField
              label="Volume (%)"
              value={clip.volume * 100}
              min={0}
              max={200}
              onChange={(n) => patch({ volume: n / 100 })}
            />
            <input
              aria-label="Volume slider"
              type="range"
              min={0}
              max={200}
              value={clip.volume * 100}
              onChange={(e) => patch({ volume: +e.target.value / 100 })}
            />
          </>
        )}
        <h4>Fade in / out</h4>
        <p className="muted">Applies to picture and sound.</p>
        <div className="field-grid">
          <NumberField
            label="Fade in (s)"
            value={seconds(clip.fadeIn)}
            min={0}
            max={seconds(clip.timelineDuration)}
            step={0.1}
            onChange={(n) => patch({ fadeIn: ticks(n) })}
          />
          <NumberField
            label="Fade out (s)"
            value={seconds(clip.fadeOut)}
            min={0}
            max={seconds(clip.timelineDuration)}
            step={0.1}
            onChange={(n) => patch({ fadeOut: ticks(n) })}
          />
        </div>
        {asset && (
          <>
            <h4>Source</h4>
            <p className="source-path">{asset.path}</p>
            <small>
              {asset.width} x {asset.height} / {asset.frameRate.toFixed(2)} FPS
            </small>
          </>
        )}
      </fieldset>
    </aside>
  );
}
