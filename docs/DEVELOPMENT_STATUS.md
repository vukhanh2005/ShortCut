# Development status - 2026-10-11

## Real-time editing and smart timeline milestone - 2026-10-11

This is the current milestone. Older sections below retain historical evidence.

Root causes: inspector controls applied values on blur; preview text dragging
used local position state until release. Other components therefore saw only the
last committed project. Occupied-track moves used collision rejection without a
before/after placement proposal. Timeline and library had no marquee interaction.

- Added one shared transient transaction in the existing Zustand store. Preview,
  inspector and timeline consume the same effective project. Numeric drafts keep
  incomplete strings local; valid values render before blur. Commit adds one
  history entry; Escape/capture loss cancels. Delayed opens protect live edits.
- Text drag uses actual canvas coordinates, RAF updates, center guides, pointer
  capture and one-step undo. Fit and half-fit zoom work in vertical projects.
- Inspector groups actual controls into collapsible Basic, Crop, Text style,
  Audio, Speed & timing, Fades and Source sections. Visible slider labels, units,
  reset actions, focus states and validation replace the prior flat layout.
- Smart insert is the UI default. Before/after targets produce validated ghosts;
  only destination followers and linked partners shift. Same-track blocks reorder,
  free moves retain timing, and locks/conflicts reject atomically. Normal,
  Overwrite and explicit Ripple remain separate modes.
- Timeline marquee supports linked selection, Ctrl/Meta addition, Shift range,
  zoom/scroll coordinates and cancellation. Library selection is independent,
  supports Ctrl/Shift/marquee and ordered multi-asset insertion. Mixed video/audio
  batches use compatible tracks; generated tracks and insertion share one undo.

Verification: production build; 60 unit/native tests; 15 Electron desktop
tests, including live inputs, sliders, text capture loss, fit zoom,
smart ghosts, linked moves, marquee after scroll/zoom, mixed batches, save/reopen
and existing eight-clip MP4 export. Native layer test commits a live crop before
save/reload and checks exported pixels and audio. Inspector screenshot inspected.
An earlier desktop run failed an auto-track count assertion after cancel/retry;
targeted reproduction passed, then the full suite passed with a ghost readiness
assertion before release. Earlier library marquee test coordinates were outside
the visible grid and were corrected. A subsequent capture-loss test read coordinates
before the preceding Undo render; it now waits for restored coordinates before
starting the next gesture. Failed runs are not counted as passes.

Limits: color effects, keyframes, transition entities and resize/rotation handles
remain unsupported. Crop supports free boundaries/reset, no aspect presets.
Numeric controls use typing/arrow keys and native sliders, no custom value drag.
Library marquee has no edge autoscroll. Smart insertion may reject conflicting
linked tracks or interleaved mixed batches instead of silently unlinking or
overwriting. Large-project interactive latency and long-run A/V drift remain
unqualified. Next: profile transactions at clip limits, improve library scrolling,
and add shared preview/export effects only with native parity checks.

Current bundle: `dist/assets/index-B9V44-Je.js`. Portable and NSIS builds passed;
packaged 1080p open/seek/play/scrub plus live rotation/Escape smoke passed.

Release verification and artifact hashes: see release.md. No runtime dependency
added. Prior dirty-worktree changes and schema compatibility are preserved.

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

## Phase file map

| Phase             | Files changed / inspected                                                                                                                           | Result and remaining scope                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A - Diagnosis     | `src/editor/timeline.ts`, `src/stores/editor.ts`, `src/components/Timeline.tsx`, `electron/media.ts`                                                | Ordinary explicit-time drops incorrectly inherited ripple. Populated track management was missing. Existing IDs/source references valid. Findings recorded; no claim that empty-track deletion itself rippled. |
| B - Correctness   | `timeline.ts`, `model.ts`, `stores/editor.ts`, `Timeline.tsx`, `tests/timeline.test.ts`                                                             | Explicit insertion modes and owned-track deletion; crossing captions untouched, links/locks/history preserved. 40 targeted tests passed before Phase C. Overwrite requires unlinking affected groups.          |
| C - Editing UX    | `Timeline.tsx`, `MediaLibrary.tsx`, `Inspector.tsx`, `App.tsx`, `styles.css`, `timeline.ts`, `model.ts`, `stores/editor.ts`, desktop/timeline tests | Atomic creation zones, linked collision relocation, magnetic feedback/markers/N preference, edge scroll and focus-safe pointer transactions. Mouse tests passed. Transition/keyframe drags remain unsupported. |
| D - Waveforms     | `electron/media.ts`, `electron/waveform.ts`, `src/editor/waveform.ts`, `model.ts`, `Timeline.tsx`, `tests/waveform.test.ts`, native test            | Real per-channel peak/RMS analysis, bounded pyramid cache, source-correct visible rendering. Decoded synthetic regression passed. Long-source bins remain coarser.                                             |
| E - Integration   | `tests/timeline.test.ts`, `tests/e2e/timeline.spec.ts`, `tests/e2e/desktop.spec.ts`, existing native/persistence/layer suites, package artifacts    | 54 unit/native and 11 desktop tests passed; production build/format and packaged smoke passed. Later gain/mute and horizontal-snap assertions passed targeted runs. Installer execution/clean VM untested.     |
| F - Documentation | `DEVELOPMENT_STATUS.md`, `AGENT_HANDOFF.md`, `PRODUCT_AUDIT.md`, `timeline-semantics.md`, `project-schema.md`, `release.md`                         | Actual semantics, evidence, root cause and limits recorded. Earlier milestone sections retained as historical context.                                                                                         |

## Previous milestone (historical evidence)

## Current milestone

Core correctness hardening and basic audio mixer. Existing timeline fixes retained
and independently revalidated. Product is still incomplete; no full release or
P0 qualification claim. Transition/keyframe work must not replace unresolved core
transport, recovery and media-format qualification.

## Architecture

Electron 44, React 19, TypeScript 7 strict, Vite 8, Zustand. Pure transactional
timeline engine; integer microseconds and absolute frame quantization. Schema-1
JSON with optional additive fields. Sandboxed preload/named IPC, authorized media
URLs with byte ranges. HTML media/Web Audio/CSS preview, FFmpeg filter graph and
libass export. FFprobe validates output. No new dependencies this milestone.

## Implemented and verified

- Captured frame scrubbing, zoom/scroll, last-valid-frame clamp and decoder seek
  correction; split/trim/move/ripple; atomic linked video-layer transfers.
- Multilayer preview/export with opacity, crop, scale, position and rotation;
  explicit linked separation, unlink and independent audio extraction.
- Guard delayed open against intervening edits. Guard delayed save completion
  using document generation, including reopening another revision of same ID.
- Serialize recovery write/read/clear requests. Restore after forced process exit;
  recovered document remains unsaved after edit/undo until explicit save.
- Incompatible replacement source opens as missing with original clip metadata
  preserved; relink checks kind, duration and audio stream and clears missing flag.
- Failed duplicate preserves cursor/history; duplicate undo restores old cursor;
  document load clears foreign clipboard.
- Playback pauses all active media when any decoder seeks/buffers, then resumes
  together. Actual play rejection becomes visible error rather than silent stall.
- Optional track volume and clip mute persist in schema 1. Clip/track gain in dB,
  percentage clip gain retained, mute leaves picture visible. Preview Web Audio
  and FFmpeg both multiply clip and track gain. -60 dB means silence; maximum
  linear gain is 2 for each control. Link Audio/Video controls remain explicit.
- Existing local import, waveforms, voice/music/SFX tracks, text/subtitles/SRT,
  fades, undo/redo, proxies, atomic save/backups, export/cancel/NVENC remain.

## Validation executed

- Initial baseline: production build, 40 unit/native tests, 6 Electron tests.
- Current full native/unit suite: 46 passed in 3.80 seconds.
- Current full desktop suite: 9 passed in 32.5 seconds. Covers prior workflows,
  actual IPC recovery ordering, delayed-open editing, abnormal exit/restart,
  shortened-source relink, Web Audio gain/mute/persistence and decoder buffering.
- Subsequent recovery edit/undo dirty-state fix: rebuilt; targeted recovery test
  passed in 5.1 seconds. Link button labels changed in same build.
- Native mixer render measures expected PCM amplitude at 0.5 clip x 0.5 track
  gain, confirms mute removes audio stream, and checks zero/invalid track gain.
- Native layer tests retain source mapping, pixels, audio frequency timing,
  crop/rotation/order and extraction-no-double-sound assertions.
- New mixer desktop test observes real GainNodes (test-only AudioContext wrapper),
  verifies combined gain and actual video mute state. Buffer test deliberately
  holds one decoder's readiness, checks other players paused and playhead frozen,
  then confirms resume. This is controlled buffering, not network stress.
- Initial shortened-source test found stale missing flag; fixed, rerun passed.
  Earlier layer test failed before invalid-drop assertion once; rerun reached a
  ruler click obstructed by its playhead handle. Test now clicks uncovered ruler
  area; full suite passes. Failed/interrupted runs are not counted as passing.

Production build: `dist/assets/index-BdnMd72M.js`, built 2026-10-11. One-minute 1080p benchmark rerun: load 1921 ms, first decoded frame 1954 ms,
seeks 62..162 ms, Electron working set 827 MiB, CPU export 34.03 seconds. Browser
RAF median 8.3 ms/p95 8.5 ms/max 33.4 ms (120 samples); these are UI frame intervals,
not decoded-video FPS or audio-sync measurements. Portable and NSIS packages refreshed successfully. Packaged 1080p open, seek,
playback and captured scrubbing smoke passes without development server or UI
errors. Exact sizes/hashes in release.md. Installer execution remains untested.
Final Prettier and whitespace checks pass. Latest targeted mixer rerun also passes
following test-only initialization ordering cleanup.

## Partial features and known limitations

Browser transport is not sample-locked; long-run drift, VFR and rotated-source
qualification remain. Short buffering regression now works, but hardware decoder
stress is not qualified. Preview text metrics/antialiasing can differ from libass;
crop edges can differ by pixel rounding. Caption pass remains above video media.

Recovery is debounced 1.5 seconds; abrupt exit can lose edits newer than last
completed autosave. Native operations are serialized in one process; concurrent
app instances, disk-full/power-loss fault injection remain unqualified. Atomic
saves retain backups but do not claim filesystem-wide power-loss durability.

Track gain lives in selected clip's inspector; no standalone mixer strips or
normalization. Audio and video fades share existing clip fields; use separated
audio for independent properties. Waveforms remain 256 source-wide peaks.

Import/proxy jobs lack UI cancellation. Proxy output is not yet published through
a validated temporary file; abrupt process exit can leave partial cached output.
Session media maps and proxy retention remain bounded by existing coarse limits.
Export publication requires hard links; FAT/exFAT unsupported. FFmpeg external,
unsigned Windows packages, no clean-machine installer/uninstaller test.

## Missing features

Crossfade/dissolve/slide/zoom transition entities, brightness/contrast/saturation/
blur effects, deterministic linear keyframes, font weight, preview resize/rotation
handles, automatic captions, advanced presets, cache-management UI, persistent
diagnostic logs and independent export canvas/FPS controls remain unimplemented.
No controls falsely present these as working.

## Technical debt and next tasks

1. Add 30/60 FPS multidecoder A/V marker stress through clip boundaries, stalled
   decoder and source replacement; measure drift, decoded frames and UI latency.
2. Add VFR/rotation fixtures and disk-full/concurrent save/recovery fault tests.
3. Define source-handle-aware transition model and ripple/trim/split behavior;
   implement crossfade first with shared preview/export semantics and pixels/audio
   tests before exposing transition controls.
4. Add deterministic clip-local linear keyframes, including split/trim/speed
   semantics and saved/exported evaluation; then expand effects/text controls.
5. Complete requested 1080x1920 eight-clip workflow including transitions. Existing
   eight-clip desktop workflow and separate one-minute 1080p benchmark are not a
   substitute for that full feature-complete scenario.
6. Cancelable import/proxy, atomic proxy publication, cache UI; then FFmpeg binary
   redistribution/legal review, signed packages and clean Windows qualification.

`PRODUCT_AUDIT.md` contains feature-by-feature status, sources, severity and next
actions. `AGENT_HANDOFF.md` contains exact continuation commands and decisions.
