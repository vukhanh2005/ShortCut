# Timeline scrubbing and layer fixes

## Root causes

- Playhead CSS disabled pointer events. Ruler handled only pointer-down, with no
  captured drag. Store seeking allowed non-frame times and the exclusive end.
- Clip movement measured horizontal displacement only, dropping vertical-only
  gestures. Linked groups were prohibited from changing tracks. Video sources
  with sound passed audio-track validation, silently changing their visual role.
- Clip drag feedback translated the original element without showing validated
  destination, snapped position, trim result or linked movement.
- Preview metadata callbacks lacked a seek-completion correction path. Crop was
  rejected by schema and absent from preview/export.

## Implementation and changed files

| Files                                                                                                                                      | Change                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/editor/model.ts`                                                                                                                      | Absolute integer-microsecond frame seeking and last-valid-frame clamp; validated optional crop, audioEnabled and audioOnly fields. Existing schema-1 files remain readable.                                                                     |
| `src/editor/timeline.ts`                                                                                                                   | Atomic matching-type transfers with an explicit anchor; linked audio retains its track and receives the same horizontal delta. Explicit audio separation preserves source mapping, gain and fades; disables embedded sound to prevent doubling. |
| `src/stores/editor.ts`                                                                                                                     | Manual seek pauses and quantizes; edits clamp playhead; copying legacy audio preserves its audio-only role.                                                                                                                                     |
| `src/components/Timeline.tsx`, `src/styles.css`                                                                                            | Captured scrub/move/trim interactions, keyboard-accessible handle, actual ruler coordinates, validated ghosts, rejection feedback and Escape/pointer cancellation. Context commands: Separate linked audio, Unlink Audio, Extract Audio.        |
| `src/components/Preview.tsx`, `src/app/App.tsx`                                                                                            | Coalesced decoder seeks corrected to latest target; no decoder callback writes playhead. End-of-playback retains last frame; restart handles that position. Muted embedded audio and CSS crop.                                                  |
| `src/components/Inspector.tsx`, `electron/render.ts`                                                                                       | Four crop controls; matching transparent RGBA crop/pad before flips and rotation; audioEnabled respected in export.                                                                                                                             |
| `tests/timeline.test.ts`                                                                                                                   | Frame rates, atomic linked moves, locks/collisions/types, split source ranges, extraction, persistence, crop validation, undo/redo and linked duplication.                                                                                      |
| `tests/layers.test.ts`                                                                                                                     | Generated real two-scene media; MP4 pixels, transformed layers, reversed track order, saved links and frequency-based audio timing checks.                                                                                                      |
| `tests/e2e/timeline.spec.ts`                                                                                                               | Real Electron pointer scrubbing, drag proposals/cancellation, invalid drop rollback, audio separation, preview pixels and save/reopen/unlink.                                                                                                   |
| `README.md`, `docs/timeline-semantics.md`, `docs/project-schema.md`, `docs/export-pipeline.md`, `docs/roadmap.md`, `docs/AGENT_HANDOFF.md` | Current semantics, schema compatibility and remaining work.                                                                                                                                                                                     |

Track order remains deterministic: first media track is on top; captions retain
their existing separate topmost pass. Same-track overlaps still reject. Different
video tracks may overlap. Vertical moves preserve attached sound; linked objects
on other tracks retain track IDs. Moves do not ripple; existing insert/trim/delete
ripple validation remains in use. No parallel timeline engine or dependency added.

## Validation

- Production TypeScript checks, Vite build, Prettier check and git diff whitespace
  check pass. No separate lint command is configured.
- All 6 Playwright desktop tests pass (33.1 seconds for the final suite).
- 40 Vitest tests pass, including existing split/trim/ripple, native media,
  cancellation, persistence and GPU trial/export regressions.
- New frame tests cover 24, 25, 30 and 60 FPS, absolute frame indices, exact and
  rounded exclusive ends, clamping and playback pause.
- Native fixture contains red video/440 Hz followed by blue video/880 Hz. Split
  second segment at source 2 seconds, move to timeline 1 second, and crop left
  half. Decoded MP4 pixels show red/blue simultaneously; cropped area reveals red
  during overlap and black afterward. Reversing track order makes red cover blue.
  Scale, position, 90-degree rotation and 50% opacity also pass pixel assertions.
- PCM frequency checks find only 440 Hz before overlap, both 440/880 Hz during
  overlap, and only 880 Hz afterward. Extracted audio amplitude confirms embedded
  sound is disabled rather than doubled.
- Desktop scrub checks assert currentTime within 5 ms of requested source time,
  no pending seek, and matching displayed timecode at 30/60 FPS. They cover live
  updates before release, pointer outside ruler, rapid reversals, first/last
  frames, playback interruption, zoom, horizontal scrolling and arrow stepping.
- Desktop layer checks assert simultaneous playback of all three decoders,
  vertical-only move, validated ghost, Escape cancel,
  overlap, invalid audio drop with unchanged saved project, linked horizontal
  audio movement, exact source times, preview screenshot pixels, save/reopen and
  explicit unlink. Existing desktop workflow retains trim, ripple, undo/redo,
  captions, source seeking, playback, persistence and export coverage.

## Package verification and test-run notes

Portable `release/ShortCut-Studio-0.1.0-Windows.exe` and NSIS
`release/ShortCut-Studio-0.1.0-Setup.exe` rebuilt successfully on 2026-10-11.
`scripts/smoke-package.mjs` now also drags the actual playhead outside the ruler.
Packaged runtime passes 1080p open, seek, playback advancement and captured scrub
checks with no UI errors. `docs/package-smoke.json` records results;
`docs/release.md` records current sizes and SHA-256 values. Installer execution and
clean-machine qualification were not performed.

One native fixture setup exceeded its existing 10-second hook timeout while
package compression ran concurrently. Rerunning after packaging passed all 40
tests in 5.57 seconds; the timed-out run is not counted as a pass. Initial new UI
test failures were test-harness issues (window creation wait, page callback
argument, offscreen target, and waiting for reopen completion); corrected tests
pass. The final six-test desktop suite passed, and the subsequently strengthened
simultaneous-playback layer test passed separately.

## Remaining limitations

- Browser decoders coalesce seeks; intermediate frames may be skipped during fast
  scrubbing. Final requested frame is corrected after decode. Playback is not a
  sample-locked audio transport; no explicit decoded-frame cache exists.
- Crop edges use browser subpixel geometry versus integer export pixels; edge
  antialiasing can differ. Browser/libass text metrics retain existing differences.
- Captured dragging continues outside ruler; automatic edge scrolling is not
  implemented. Use existing horizontal/vertical scrolling to reach other regions.
- Transition entities remain unsupported; clip fades retain their existing
  behavior. No transition drag mode is exposed.
- Existing ceilings remain: 32 tracks, 512 clips, 12 preview decoders and 64 export
  media inputs. FFmpeg/FFprobe remain external. Clean-machine installer testing,
  signing, VFR stress testing and long-run audio drift qualification remain open.
