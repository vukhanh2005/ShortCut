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
migration yet. Unsupported transition and keyframe fields reject explicitly.
Optional `audioEnabled` defaults to true; false disables embedded audio after
separation. Optional `audioOnly` marks explicitly extracted clips, which must
remain on audio tracks. Legacy video-source audio clips remain readable and gain
this marker when copied. Optional `transform.crop` has normalized `left`, `right`,
`top`, `bottom` values in [0,1]; opposing sums must be below 1. Missing crop means
zero. Crop applies only to media. Existing schema-1 files need no migration.
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

Optional `Track.volume` defaults to 1 and validates finite 0..2. Optional
`Clip.muted` defaults to false and affects sound only. Clip volume and track volume
multiply in preview/export. Mute and gain persist independently of track mute and
`audioEnabled` (which remains the extraction ownership flag). Inspector dB values
convert to linear gain; -60 dB is a deliberate silence endpoint, not -infinity.

Optional `markers: {id, time, name}[]` stores absolute project-time guides
(maximum 512). Marker IDs share entity uniqueness validation. Markers never
ripple and do not extend render duration. Runtime `MediaAsset.waveform` accepts
legacy peak arrays or version-2 channel peak/RMS pyramids; serialization excludes
both formats and hydration regenerates them from source/cache.
