# Architecture and milestones

## Phase 0 decision

Empty workspace inspected on 2026-10-10. Node 24.19.0, npm 11.17.0,
FFmpeg/FFprobe 8.1.1, Visual Studio 18 C++ tools and WebView2 available.
Rust/cargo absent, including the default cargo install directory.
Electron 44 replaces preferred Tauri 2 so a desktop application can be built
without installing a system toolchain. React 19, TypeScript 7 strict mode,
Vite 8, Zustand 5. No remote services. CSS uses native grid and resize controls.

Renderer has no Node access. Sandboxed preload exposes a small typed bridge.
Main process owns dialogs, file grants, media probing, cache, project writes,
and FFmpeg subprocesses. Processes use argument arrays, never shell strings.
Project/timeline domain is shared pure TypeScript, independent of React.
Export compiles validated project data into a bounded FFmpeg filter graph.

## Milestones

0. Compile, launch, tests, architecture checkpoint.
1. Resizable desktop workspace and project presets.
2. Probe/import, thumbnails, validated integer timeline, transactional history.
3. Explicit ripple scope, boundary/lock checks and data tests.
4. Controlled active media playback, composition and frame seeking.
5. Waveforms, audio fades/mixing, SRT subtitles and styling.
6. Only effects reproducible in both preview and export; defer advanced effects.
7. MP4 renderer, progress/cancel and FFprobe validation.
8. Atomic project persistence, recovery and missing-media relink.
9. Portable Windows packaging, verification and accurate limitations.

Each phase is verified before marked passed. Partial features are not represented
as completed controls. Full production readiness requires clean-machine and
performance qualification beyond a successful local build.
