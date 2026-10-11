# Handoff

## Current: real-time editing and smart timeline - 2026-10-11

Continue the existing project; all uncommitted changes belong to these milestones.
Current behavior supersedes the historical Normal-default milestone below.

`stores/editor.ts` owns `interactive` and begin/update/commit/cancel operations.
`effectiveProject` is the only shared live project; committed `project` remains the
save/export/autosave source. Preview text drag coalesces updates with RAF. Inspector
NumberField retains only string drafts, validates before applying, and commits on
blur/Enter; Escape restores its initial value. Sliders and caption/color edits
share transactions. Selection/save settle edits; delayed open detects live edits.

`editor/timeline.ts` owns `placementTarget`, destination/link sequence shifting
and atomic `insertMany`. `Timeline.tsx` defaults to Smart insert, derives ghosts
from the exact proposed engine command, and keeps Normal/Overwrite/Ripple explicit.
Same-track contiguous blocks close the vacated span before insertion. Gapped
blocks preserve their relative timing without consuming unselected source clips.
Locks and linked-track conflicts still reject atomically with visible reasons.

`editor/selection.ts` supplies rectangle/range geometry. Timeline marquee uses
model clip bounds with live scroll/zoom, expands links and skips locked groups.
Media-library `assetSelection` is separate from clip selection; Ctrl/Shift/marquee
and group dragging use displayed asset order. Mixed kinds route to matching free
tracks or generate one; a rejected batch preserves all project data/history.

Checks executed: 60 unit/native tests; 15 desktop tests, including real mouse
sliders/text dragging, live inspector sync, lost capture, marquee at scroll/zoom,
smart before/after ghosts, ordered mixed batches, undo/redo and persistence.
Native export checks consume a committed live crop. Build passed and inspector
screenshot inspected. See DEVELOPMENT_STATUS.md for failed-run details and
release.md for final package checks/hashes. Do not run native rendering tests
concurrently with Windows package compression; prior runs encountered contention.

Current bundle: `dist/assets/index-B9V44-Je.js`. Portable/NSIS builds passed;
packaged 1080p open/seek/play/scrub and live rotation/Escape smoke passed.
Artifact sizes and SHA-256 are in release.md.

Remaining scope: no color effects/keyframes/transitions, crop aspect presets or
resize/rotation handles. No custom numeric drag control or library edge scroll.
Conflicting linked sequences/interleaved mixed insertions can reject safely.
Profile transient clone/validation cost near clip limits before claiming large
project smoothness. Keep native export parity as the gate for future effects.

## Timeline engine milestone - 2026-10-11

This milestone supersedes earlier timeline behavior described below. Existing
project data, render/preview architecture and prior dirty-worktree changes remain.

- Phase A: reproduced explicit-time insertion invoking global ripple while library
  Add bypassed it. Crossing captions correctly blocked the requested ripple but
  the mode was unintended. Clip IDs/source reuse were already valid. Existing
  track deletion only supported empty tracks and did not ripple; populated-track
  removal required ripple-sensitive clip deletion. No direct track-delete ripple
  defect was reproduced.
- Phase B: normal/overwrite/ripple insertion modes; normal default; fresh IDs;
  track-owned deletion with confirmation, lock checks, link cleanup and history.
  New projects default ripple off, old saved settings retained. Phase gate passed
  40 timeline/persistence tests before UX work.
- Phase C: atomic video/audio creation zones and ghosts, linked audio collision
  relocation, 10px snapping/13px hysteresis, both clip edges, playhead, markers,
  saved magnet preference/N shortcut, explicit drag state and edge scrolling.
  Real mouse tests cover cancel, invalid type, split overlap, deletion and undo.
- Phase D: channel-preserving 48kHz peak/RMS pyramid, source/configuration cache,
  visible-region SVG paths and immutable history sharing. Decoded silence, sine,
  ramp, impulse, opposite-phase stereo, split/trim source mapping, speed, zoom,
  repeated source and cache invalidation assertions executed.
- Phase E: production build passed; 54 unit/native tests passed (3.72s); all
  11 Electron desktop tests passed (35.8s). Native CPU/NVENC renders include
  FFprobe, source-mapped pixels and audio checks. Eight-clip desktop workflow
  saves/reopens/exports MP4. Auto-track/library tests use real mouse events.
  Subsequent automatic-audio gain/mute preservation passed 38 timeline tests.
  Earlier failed runs exposed checkbox/inspector focus handling and test dialog
  stubs; final focus fix starts drag after blur and avoids unchanged-field edits.
  An initial desktop run was interrupted after its failure cleanup waited on
  unsaved-project confirmation; it is not counted as passing.
- Phase F: timeline semantics, audit and handoff updated for current behavior.

Limits: no transition/keyframe entities or drags; no separate guide editor.
Waveform budget is 131072 base bins across channels; long media has coarser zoom.
Automatic audio relocation preserves originating track gain/mute.
No sample-locked playback or long-run drift claim. Import cancellation, clean VM
installation, signing and FFmpeg redistribution remain outside this milestone.

Current production bundle: `dist/assets/index-D_LE8SGs.js`. Portable and NSIS
packages rebuilt successfully; packaged 1080p open/seek/play/captured-scrub smoke
passed without UI errors. Prettier and `git diff --check` passed. Package sizes
and SHA-256 are in release.md. After the full desktop suite, the auto-track test
was extended to snap after 300px horizontal scrolling and passed again (3.4s).
No new runtime dependency was added.

## Previous milestone (historical evidence)

## Latest session - 2026-10-11

Current milestone: P0 persistence/media/transport hardening plus basic audio mixer.
Read PRODUCT_AUDIT.md and DEVELOPMENT_STATUS.md first; older foundation details
below are historical context. Preserve all uncommitted timeline fixes and this
session's additions. No new dependency or architecture replacement.

Changed this session: document-generation save guards; opening-snapshot rejection
when edits occur during open; serialized recovery write/read/clear; recovered
project stays dirty through undo; duplicate atomic cursor/history; clipboard
cleared on load; incompatible source retained as missing for relink; relink clears
missing and preserves audio; all decoders pause together during seek/buffering.
Added optional track.volume (default 1) and clip.muted (default false), dB inspector
and explicit mute command. Preview/export multiply clip and track gain. Audio
normalization is not implemented. Existing percent controls remain compatible.

Validation: build, 46 unit/native tests, 9 Electron tests pass. Last recovery
edit/undo change rebuilt and passed targeted test. Native audio render checks
measure PCM gain and mute; desktop tests observe actual GainNodes and stalled
media behavior. This does not establish sample-locked or long-run A/V accuracy.

Exact next implementation step: create 30/60 FPS multidecoder A/V marker stress
fixture spanning cuts, buffering and source replacement; collect source-time drift
and decoded-frame counts. Follow with VFR/rotation and disk-full recovery tests.
Only then move into crossfade source-handle semantics, shared preview/export and
transactional trim/split/ripple behavior. No fake transition controls.

Commands: `npm run build`, `npm test`, `npm run test:e2e`, `npm run format:check`.
`node scripts/benchmark.mjs` uses built native modules; do not overlap it or tests
with package compression. For packages use PowerShell
`$env:ELECTRON_BUILDER_COMPRESSION_LEVEL = '1'; npm run package`, then
`node scripts/smoke-package.mjs`. Update release hashes after packaging.
Packages refreshed and packaged 1080p smoke passes after this milestone.
Current sizes/hashes: release.md. One-minute CPU export benchmark: 34.03 s;
project load 1921 ms, first frame 1954 ms, seeks 62..162 ms, 827 MiB working set.
No clean-machine VM, signing or redistributed FFmpeg qualification completed.

## Earlier foundation snapshot

Status: functional 0.1 desktop editor foundation. Phases 0..3 passed; 4..9 partial.
Do not claim full master-prompt completion. See phase-reports.md for each exit gate.

## Architecture

Electron 44 replaces Tauri because Rust was absent. React/TS strict/Vite/Zustand.
Pure timeline domain in src/editor; transactional history in src/stores.
Sandboxed preload exposes named operations to electron/services.ts. Native media
uses FFprobe/FFmpeg subprocess argument arrays. Byte-range media protocol in
electron/media-response.ts authorizes opaque IDs, streams bounded file reads.
RenderPlan/filtergraph/libass export in electron/render.ts. JSON project storage
with backup/atomic rename and separate recovery. No cloud services.

## Completed

Resizable desktop workspace, presets/custom canvas, local media library,
waveforms/thumbnails, video/audio/subtitle tracks, move/trim/split/delete/duplicate,
link/unlink, ripple scopes/validation, snap, undo/redo, keyboard shortcuts,
captured frame scrubbing, linked video-layer transfers, audio separation, static
crop, actual preview/seek, audio gain/fades, transforms, caption styles and SRT,
save/open/relink/recovery, MP4 render/progress/cancel/validation, CPU fallback,
optional proxies, portable/NSIS packaging configuration and original icon.

## Validation

Prior baseline: production build, 29 Vitest tests and 3 Playwright desktop tests.
Current timeline fix validation is recorded in timeline-fix-report.md.
Desktop workflow imports eight videos, edits/ripples, adds narration/SFX/Unicode
caption, saves/restarts/reopens/exports. FFprobe, pixel and PCM checks executed.
One-minute 1080p benchmark completed; see benchmark-latest.json and testing.md.
Measured CPU export 32.22 s. NVENC trial and real GPU export pass on RTX 2050.
Rebuilt 2026-10-11 packaged executable opens, seeks, plays and scrubs the 1080p
project without a dev server.
Portable EXE (137118452 bytes) and NSIS installer (137328876 bytes) built.
See release.md for SHA-256 values and exact verification limits.

Important fixes: no module-level app-ready await (Electron startup deadlock);
custom media protocol must enable CORS and send explicit Range/206 responses.
Small fully-buffered fixtures previously masked seek failures; regression now
asserts actual requested source timestamp and playback advancement.

## Known gaps

No keyframes/crossfade/dissolve/slide/zoom transitions or automatic STT.
Preview uses browser clock/decoders, not sample-locked transport. Browser/libass
fonts, wrapping and boxes can differ. No explicit decoded frame cache. History
and proxies are session-only. 32 tracks/512 clips/2000 assets; render max 64 media
inputs; preview max 12 active decoders. NTFS hard-link final publish rejects
FAT/exFAT. FFmpeg CLI external; unsigned packages; clean-machine install pending.
Import/proxy jobs do not yet have UI cancellation. Recovery fault injection,
VFR/rotation fixtures, relink UI tests and long-run playback drift
remain. Packaging dev dependency chain has eight moderate npm advisories;
runtime audit has zero. Full release legal/signing review still needed.

## Next steps

1. Prioritize transport/audio sync qualification, recovery/relink/VFR tests.
2. Qualify clean-machine installer and FFmpeg provisioning; test FAT/exFAT fallback.
3. Add shared linear keyframe semantics and source-handle transitions with
   preview/export tests before enabling corresponding controls.

Commands: npm ci; npm run check; npm run test:e2e; npm run format:check;
npm run package. For benchmark: npm run build, then node scripts/benchmark.mjs.
Generated test fixtures in ignored .cache, screenshot evidence in test-results.
