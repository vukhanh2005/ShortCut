# Handoff

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
actual preview/seek, audio gain/fades, transforms, caption styles and SRT,
save/open/relink/recovery, MP4 render/progress/cancel/validation, CPU fallback,
optional proxies, portable/NSIS packaging configuration and original icon.

## Validation

Production build passes. 29 Vitest tests and 3 Playwright desktop tests pass.
Desktop workflow imports eight videos, edits/ripples, adds narration/SFX/Unicode
caption, saves/restarts/reopens/exports. FFprobe, pixel and PCM checks executed.
One-minute 1080p benchmark completed; see benchmark-latest.json and testing.md.
Measured CPU export 32.22 s. NVENC trial and real GPU export pass on RTX 2050.
Final packaged executable opens, seeks and plays 1080p project without dev server.
Portable EXE (137115175 bytes) and NSIS installer (137325603 bytes) built.
See release.md for SHA-256 values and exact verification limits.

Important fixes: no module-level app-ready await (Electron startup deadlock);
custom media protocol must enable CORS and send explicit Range/206 responses.
Small fully-buffered fixtures previously masked seek failures; regression now
asserts actual requested source timestamp and playback advancement.

## Known gaps

No crop/keyframes/crossfade/dissolve/slide/zoom transitions or automatic STT.
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
