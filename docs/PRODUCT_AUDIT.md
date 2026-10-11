# Product audit - 2026-10-11

## Latest editing UX audit

Live property updates and text dragging now share one transient project. The
root causes were blur-only inspector writes and preview-local drag coordinates.
Preview, inspector and timeline now observe `effectiveProject`; release/blur
commits one validated undo transaction. Escape or lost capture restores state.
Numeric incomplete drafts cannot enter the project. A late open cannot discard
intervening live edits. Saved/exported data contains committed transforms only.

Smart before/after placement, same-track reorder, validated ghosts, timeline
marquee, library Ctrl/Shift/marquee selection and ordered mixed-media batches are
implemented. Locks, linked synchronization, source trims and atomic undo remain
engine invariants. Compact inspector sections contain supported controls only.

Evidence: 60 unit/native tests and all 15 desktop scenarios passed; live preview
before blur/release, text capture loss, zoom/scroll marquee, mixed video/audio,
save/reopen and committed-crop native export are covered. Screenshot layout
review completed. Build passed; package evidence is in release.md.

Remaining limits: no color effects, keyframes, overlap transitions, crop aspect
presets or resize/rotation handles. Library marquee has no edge autoscroll.
Complex linked-track conflicts and interleaved mixed-media insertions can reject
safely. Full keyboard-only accessibility and maximum-size interaction performance
remain unqualified; prioritize those checks before adding more editing effects.

Historical evidence follows; the latest milestone supersedes older default-mode
and interaction descriptions.

Scope: existing Electron desktop project, all application/native modules,
configuration, scripts, tests and architecture/release notes. Prior uncommitted
timeline fixes are preserved. No architecture replacement is proposed.

Architecture: React 19, strict TypeScript 7, Zustand, Vite 8, Electron 44;
FFmpeg/FFprobe processes with shell disabled. Integer-microsecond schema-1 JSON,
pure transactional timeline edits, 50-snapshot undo history, HTML media/Web Audio
preview, FFmpeg RGBA overlays/ASS captions/AAC mixing. Sandboxed preload exposes
named IPC methods; authorized opaque media URLs support byte-range seeking.

Statuses describe actual capability, not release readiness. WORKING requires
executed evidence for stated scope. NOT TESTED means code exists but relevant
qualification has not run. Severity applies to remaining defect/gap.

| Feature                                   | Status            | Source                                                           | Evidence / limitations                                                                                                                                                               | Severity | Next action                                                          |
| ----------------------------------------- | ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------- |
| Launch / desktop layout                   | WORKING           | `electron/main.ts`, `src/app/App.tsx`, `src/styles.css`          | Existing desktop smoke at 1366/1920 widths; resizable panels. No screen-reader qualification.                                                                                        | P2       | Accessibility pass.                                                  |
| Local media import                        | WORKING           | `electron/media.ts`, `src/components/MediaLibrary.tsx`           | Real video/audio/image, Unicode paths, thumbnails and waveform tests. Sequential jobs; main-process PCM loop; no import cancellation.                                                | P2       | Cancel jobs and profile long imports.                                |
| Frame scrubbing                           | WORKING           | `Timeline.tsx`, `Preview.tsx`, `model.ts`                        | 24/25/30/60 unit checks; 30/60 desktop captured drags, scroll/zoom and source times revalidated this session. Captured edge scrolling now covered by real pointer cancellation test. | P2       | Long/VFR seek stress.                                                |
| Split / trim / move                       | WORKING           | `src/editor/timeline.ts`                                         | Source-range, locks, collisions, linked moves and real pointer regressions. Per-track overlap rejects.                                                                               | P0       | Retain regression gates.                                             |
| Ripple                                    | WORKING           | `src/editor/timeline.ts`                                         | All-track/active-track tests cover linked clips, captions and locked tracks. Spanning clips reject atomically.                                                                       | P0       | Extend when transition model lands.                                  |
| Multiselection / grouping                 | WORKING           | `Timeline.tsx`, `editor.ts`                                      | Shift/Ctrl/Meta, captured marquee across tracks at zoom/scroll, linked group movement; separate library selection and atomic batches.                                                | P2       | Profile near clip limits and add library edge scrolling.             |
| Copy / paste / duplicate                  | WORKING           | `src/stores/editor.ts`                                           | Failed duplicates preserve cursor/history; successful duplicate undo restores cursor; load clears clipboard. Linked copies tested.                                                   | P0       | Retain regression tests.                                             |
| Undo / redo                               | WORKING           | `src/stores/editor.ts`                                           | 50 snapshots, transactional rejection, linked extraction/moves tested. Session-only.                                                                                                 | P0       | Keep async state changes outside edit history.                       |
| Video layer transfer / audio links        | WORKING           | `timeline.ts`, `Timeline.tsx`                                    | Matching-type drop enforcement, vertical-only move, split overlap, extraction/unlink/persistence tests.                                                                              | P0       | Retain native and desktop checks.                                    |
| Compositing / transforms / crop           | WORKING           | `Preview.tsx`, `electron/render.ts`                              | Actual preview pixels and exported pixels, order, crop, scale, position, rotation, opacity. Crop edges can differ by pixel rounding.                                                 | P0       | Add VFR/rotation metadata fixtures.                                  |
| Playback / A/V transport                  | PARTIALLY WORKING | `Preview.tsx`                                                    | Shared pause/resume when any decoder seeks/buffers, verified in Electron. Three-layer playback/seek passes. Browser clocks and long-run drift remain unqualified.                    | P0       | Long-run 30/60 FPS marker stress and decoded-frame measurements.     |
| Audio waveforms / music / SFX             | WORKING           | `media.ts`, `Timeline.tsx`                                       | Channel-preserving 48kHz peak/RMS pyramid, visible-region paths, cache reuse/invalidation and decoded synthetic signal tests. Long-file bin budget limits detail.                    | P1       | Profile long imports; tiled cache for sample-level detail.           |
| Clip gain / fades / track mute            | WORKING           | `Inspector.tsx`, `Preview.tsx`, `render.ts`                      | Gain/fades applied in preview/export, frequency/PCM checks; no independent audio fade fields.                                                                                        | P1       | Independent sound controls.                                          |
| Track gain / clip mute / dB controls      | WORKING           | `model.ts`, `Inspector.tsx`, `Timeline.tsx`                      | Optional persisted gain/mute, dB inspector, real Web Audio gain assertions and FFmpeg PCM/mute checks. No normalization.                                                             | P1       | Standalone mixer strips and independent fades next.                  |
| Text / manual subtitles / SRT             | WORKING           | `subtitles.ts`, `MediaLibrary.tsx`, `Inspector.tsx`, `render.ts` | Unicode, multiline import/export, styles, timing and native caption pixels. Browser/libass metrics differ.                                                                           | P1       | More multiline/font fixtures.                                        |
| Text weight / preview transform handles   | PARTIALLY WORKING | `Inspector.tsx`, `Preview.tsx`                                   | Inspector transform and preview position drag work; no weight field or resize/rotation handles.                                                                                      | P1       | Add shared properties with export tests.                             |
| Cuts / clip fades                         | WORKING           | `timeline.ts`, `Preview.tsx`, `render.ts`                        | Cut and clip fade semantics implemented; fades affect picture and sound together.                                                                                                    | P1       | Keep distinct from overlap transitions.                              |
| Crossfade / dissolve / slide / zoom       | NOT IMPLEMENTED   | `model.ts`                                                       | Transition entities explicitly reject; no fake controls.                                                                                                                             | P1       | Define source handles and atomic transition timing first.            |
| Brightness / contrast / saturation / blur | NOT IMPLEMENTED   | `model.ts`                                                       | Unsupported effects explicitly reject.                                                                                                                                               | P1       | Shared preview/export formulas with pixel tests.                     |
| Linear keyframes                          | NOT IMPLEMENTED   | `model.ts`                                                       | Keyframe payloads explicitly reject.                                                                                                                                                 | P1       | Deterministic clip-local evaluator, editing rules and render parity. |
| MP4 H.264/AAC / NVENC                     | WORKING           | `electron/render.ts`, `ExportDialog`                             | Real CPU/GPU renders, probe metadata, pixels/audio, cancel, no-overwrite. Resolution/FPS use project values.                                                                         | P0       | Broader 1080p60 workflow and stream-corruption tests.                |
| Export publication                        | PARTIALLY WORKING | `electron/render.ts`                                             | Safe no-overwrite NTFS hard link; FAT/exFAT fails.                                                                                                                                   | P2       | Safe alternative publication on unsupported filesystems.             |
| Save / load / Save As                     | WORKING           | `editor.ts`, `App.tsx`, `services.ts`, `project.ts`              | Atomic backups/reopen plus document-generation save guards and opening-snapshot check. Late completion tests preserve newer edits.                                                   | P0       | Disk-full/concurrent-process fault qualification.                    |
| Autosave / recovery                       | PARTIALLY WORKING | `App.tsx`, `services.ts`                                         | Write/read/clear serialized; real IPC and forced-exit recovery tests pass. Restore/edit/undo stays dirty. 1.5-second debounce and power-loss limits remain.                          | P0       | Disk-full/queue-failure tests and clear recovery dialog UX.          |
| Missing media / relink                    | WORKING           | `services.ts`, `MediaLibrary.tsx`                                | Shorter/changed-type/audio-lost replacements rejected; incompatible source opens missing. Real relink clears missing state and preserves clip ranges.                                | P0       | Broader corrupt/permission-denied media tests.                       |
| Recent projects                           | PARTIALLY WORKING | `services.ts`, `App.tsx`                                         | Native recent list persisted; renderer only refreshes environment at startup.                                                                                                        | P2       | Refresh list on successful file operations.                          |
| Proxy / cache                             | PARTIALLY WORKING | `media.ts`, `MediaLibrary.tsx`                                   | 720p proxy duration checked, size cap and startup prune. Proxy writes target directly; abrupt kill can leave reusable partial file. No UI cancellation or cleanup.                   | P2       | Publish validated temporary proxy and expose cancellation.           |
| Error handling / logging                  | PARTIALLY WORKING | `process.ts`, `App.tsx`, `main.ts`                               | Process errors, timeout/cancel, UI error text. No persistent diagnostic log.                                                                                                         | P2       | Bounded local log.                                                   |
| Keyboard / inspector / context menus      | WORKING           | `App.tsx`, `Timeline.tsx`, `Inspector.tsx`                       | Input focus regression and pointer interactions tested. Some labels rely on title; no full keyboard-only audit.                                                                      | P2       | Focus and accessible-name pass.                                      |
| Full requested Shorts workflow            | PARTIALLY WORKING | `tests/e2e/desktop.spec.ts`, `scripts/benchmark.mjs`             | Eight-clip workflow tested at 320x568; earlier 1080p benchmark separate. No transition/keyframe workflow yet.                                                                        | P1       | Complete transition milestone then 1080x1920 end-to-end fixture.     |
| Windows packages                          | PARTIALLY WORKING | `package.json`, `scripts/smoke-package.mjs`                      | Portable/NSIS built; packaged launch/1080p seek/play/scrub tested. FFmpeg external; unsigned.                                                                                        | P2       | Dependency/license packaging and clean-machine install.              |
| Clean install / uninstall                 | NOT TESTED        | `docs/release.md`                                                | No clean Windows VM available/tested.                                                                                                                                                | P2       | Manual or isolated VM qualification.                                 |
| Automatic captions / advanced presets     | NOT IMPLEMENTED   | `docs/roadmap.md`                                                | No transcription controls claiming completion.                                                                                                                                       | P3       | Defer until core gates pass.                                         |

## Audit decisions

First milestone: fix data-loss races and incompatible-source loading, protect
duplicate state; verify via deferred promises, actual IPC recovery operations,
restart and native persistence. Then implement basic mixer gap with real saved
track gain, dB controls and clip mute, verified in preview and FFmpeg audio.
Transitions/keyframes remain subsequent milestones, not claimed complete.

Initial revalidation: build, all 40 unit/native tests and all 6 desktop tests passed.
After this milestone: 46 unit/native tests and 9 desktop tests passed. Recovery
edit/undo fix subsequently rebuilt and passed targeted desktop regression.
See DEVELOPMENT_STATUS.md for exact checks, failed-run notes and current limits.
No evidence of full P0 qualification or complete product is claimed.

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

| Added capability                      | Status  | Evidence / limits                                                                                                    |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| Normal / overwrite / ripple insertion | WORKING | Ordinary drops preserve crossing captions; overwrite retains source tails; linked overwrite requires unlink first.   |
| Automatic video/audio tracks          | WORKING | Real library and pointer drops, split linked overlap, ghosts, cancel and atomic undo/redo. 32-track ceiling remains. |
| Magnetic playhead / clip snapping     | WORKING | 10px acquire, 13px hold, both clip edges, stable ties, markers, three zoom levels, persisted N toggle.               |
| Populated track deletion              | WORKING | Explicit confirmation, owned-only removal, no ripple, survivor unlinking, locks, save/load and history tests.        |

Current production bundle: `dist/assets/index-D_LE8SGs.js`. Portable and NSIS
packages rebuilt successfully; packaged 1080p open/seek/play/captured-scrub smoke
passed without UI errors. Prettier and `git diff --check` passed. Package sizes
and SHA-256 are in release.md. After the full desktop suite, the auto-track test
was extended to snap after 300px horizontal scrolling and passed again (3.4s).
No new runtime dependency was added.
