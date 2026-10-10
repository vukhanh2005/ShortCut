import { useState } from "react";
import {
  Film,
  Music2,
  Type,
  Upload,
  Plus,
  Star,
  Image,
  FileInput,
  FileOutput,
} from "lucide-react";
import { useEditor } from "../stores/editor";
import { formatTime, type MediaAsset } from "../editor/model";
import { importSrt, exportSrt } from "../editor/subtitles";
export async function busyTask(name: string, action: () => Promise<unknown>) {
  if (useEditor.getState().busy) return;
  useEditor.setState({ busy: name, playing: false, error: null });
  try {
    await action();
  } catch (error) {
    useEditor.setState({ error: String(error) });
  } finally {
    useEditor.setState({ busy: null });
  }
}
export function MediaLibrary() {
  const s = useEditor(),
    [tab, setTab] = useState("media"),
    [search, setSearch] = useState(""),
    [favorites, setFavorites] = useState(false),
    [folder, setFolder] = useState("");
  const importMedia = () =>
    busyTask("Importing media and building waveforms", async () =>
      s.importAssets(await window.studio.importMedia()),
    );
  const modify = (asset: MediaAsset, patch: Partial<MediaAsset>) =>
    s.transact((p) => {
      Object.assign(
        p.mediaAssets.find((a) => a.id === asset.id)!,
        patch,
      );
    });
  const listed = s.project.mediaAssets.filter(
    (a) =>
      (tab !== "audio" || a.type === "audio") &&
      (!favorites || a.favorite) &&
      (!folder || a.folder === folder) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <aside className="library">
      <div className="library-tabs">
        {[
          { id: "media", label: "Media", icon: Film },
          { id: "audio", label: "Audio", icon: Music2 },
          { id: "text", label: "Text", icon: Type },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="library-body">
        {tab === "text" ? (
          <>
            <div className="section-heading">TEXT & CAPTIONS</div>
            <button className="text-card" onClick={s.addText}>
              <strong>Aa</strong>
              <span>Add caption at playhead</span>
              <Plus size={18} />
            </button>
            <p className="muted">
              Style in inspector. Drag text in preview to position it.
            </p>
            <button
              className="wide-button"
              onClick={() =>
                busyTask("Importing subtitles", async () => {
                  const text = await window.studio.importSrt();
                  if (!text) return;
                  s.transact((p) => {
                    const track = p.tracks.find(
                      (t) => t.type === "subtitle" && !t.locked,
                    );
                    if (!track)
                      throw new Error("Add an unlocked subtitle track first.");
                    track.clips.push(...importSrt(text, track.id, p));
                  });
                })
              }
            >
              <FileInput size={16} /> Import SRT
            </button>
            <button
              className="wide-button"
              onClick={() =>
                busyTask("Saving subtitles", () =>
                  window.studio.saveSrt(exportSrt(s.project)),
                )
              }
            >
              <FileOutput size={16} /> Export SRT
            </button>
            <div className="note">
              Manual captions and SRT work offline. Automatic transcription is
              not included.
            </div>
          </>
        ) : (
          <>
            <div className="section-heading">
              {tab === "audio" ? "YOUR AUDIO" : "PROJECT MEDIA"}
              <small>{listed.length}</small>
            </div>
            <button
              className="import-button"
              onClick={importMedia}
              disabled={!!s.busy}
            >
              <Upload size={17} /> Import files <kbd>local</kbd>
            </button>
            <input
              className="search"
              aria-label="Search media"
              placeholder="Search your media..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="library-filters">
              <button
                className={favorites ? "active" : ""}
                title="Show favorites"
                aria-pressed={favorites}
                onClick={() => setFavorites(!favorites)}
              >
                <Star size={14} />
              </button>
              <select
                aria-label="Media folder filter"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                <option value="">All folders</option>
                {[
                  ...new Set(
                    s.project.mediaAssets.map((a) => a.folder).filter(Boolean),
                  ),
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            {!listed.length && (
              <div className="library-empty">
                <Film size={30} />
                <h3>Your story starts here.</h3>
                <p>
                  Drop video, audio, or images.
                  <br />
                  Everything stays local.
                </p>
              </div>
            )}
            <div className="media-grid">
              {listed.map((asset) => (
                <article
                  className={`media-card ${asset.missing ? "missing" : ""}`}
                  key={asset.id}
                  draggable={!asset.missing}
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      "application/shortcut-asset",
                      asset.id,
                    )
                  }
                >
                  <div className="media-thumbnail">
                    {asset.thumbnail ? (
                      <img src={asset.thumbnail} alt="" />
                    ) : asset.type === "audio" ? (
                      <Music2 size={27} />
                    ) : (
                      <Image size={27} />
                    )}
                    <span>{formatTime(asset.duration).slice(0, 5)}</span>
                    <button
                      title={`Favorite ${asset.name}`}
                      className={asset.favorite ? "favorite" : ""}
                      onClick={() =>
                        modify(asset, { favorite: !asset.favorite })
                      }
                    >
                      <Star size={13} />
                    </button>
                  </div>
                  <strong title={asset.path}>{asset.name}</strong>
                  <div className="media-meta">
                    <span>
                      {asset.type === "audio"
                        ? "AUDIO"
                        : `${asset.width} x ${asset.height}`}
                    </span>
                    <button
                      title={`Add ${asset.name} to timeline`}
                      aria-label={`Add ${asset.name}`}
                      disabled={asset.missing}
                      onClick={() => s.addAsset(asset)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <details>
                    <summary>Manage</summary>
                    <input
                      aria-label={`Folder for ${asset.name}`}
                      placeholder="Folder label"
                      defaultValue={asset.folder}
                      onBlur={(e) => modify(asset, { folder: e.target.value })}
                    />
                    <button
                      onClick={() =>
                        busyTask("Relinking media", async () => {
                          const replacement = await window.studio.relink(asset);
                          if (replacement) modify(asset, replacement);
                        })
                      }
                    >
                      Relink file
                    </button>
                    {asset.type === "video" && (
                      <button
                        onClick={() =>
                          busyTask("Building preview proxy", async () =>
                            modify(asset, await window.studio.proxy(asset.id)),
                          )
                        }
                      >
                        Make 720p proxy
                      </button>
                    )}
                  </details>
                  {asset.missing && (
                    <span className="missing-label">Missing file - relink</span>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="library-footer">
        <span className="status-dot" /> LOCAL WORKSPACE{" "}
        <span>{s.project.mediaAssets.length} assets</span>
      </div>
    </aside>
  );
}
