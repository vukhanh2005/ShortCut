# Project files

`.shortcut` files contain inspectable UTF-8 JSON, schemaVersion 1. Model and runtime
validator live in `src/editor/model.ts`. Root holds ID, name, resolution, frame
rate, aspect ratio, ordered tracks, media assets and editor settings. Clips store
source and timeline ranges, playback speed, transforms, opacity, volume, fades,
optional text style and optional group ID. Unicode paths and caption text work.

Runtime URLs, thumbnails, waveforms and missing flags are not persisted. They are
reconstructed on open. Source paths remain absolute; use Relink after moving
media. Relinking requires the same media kind and at least the original source
duration. This conservative check preserves every existing source range.
Preview proxies are cache/session resources and never replace export originals.

Unknown schema versions are rejected; no earlier released schema requires a
migration yet. Unsupported transition, keyframe and crop fields reject explicitly.
Add a tested migration before incrementing schemaVersion. Do not silently
discard new render features when opening a newer project.

Writes validate first, create a unique sibling temporary file, flush file contents,
retain a `.bak` copy of the previous target, then rename. Incomplete temporary
files are ignored. Directory fsync and power-loss guarantees on every filesystem
are not claimed. Recovery uses a separate file, debounced 1.5 seconds, with
serialized writes. Successful save removes the recovery file only when no later
edits exist. Missing or damaged media is shown for relinking, not silently removed.

Recent paths (up to 12), recovery and cache use Electron's per-user application
data directory. No account, remote storage, database or telemetry.
