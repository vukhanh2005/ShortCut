# ShortCut Studio 0.1.0 local build

Rebuilt 2026-10-11 with live property/text editing, compact inspector, smart before/after placement, timeline/library marquee and ordered mixed-media batches. Prior automatic tracks, snapping, waveforms, persistence and mixer fixes remain. Functional foundation, not production-qualified full editor.

| Artifact                                  |     Bytes | SHA-256                                                          |
| ----------------------------------------- | --------: | ---------------------------------------------------------------- |
| release/ShortCut-Studio-0.1.0-Windows.exe | 137129550 | 9F7AF06EA35E20134B69941AA5860315C452866ADEB6ED7E7F434B0C703302B8 |
| release/ShortCut-Studio-0.1.0-Setup.exe   | 137339980 | 0A99D8D352292DE2FDA8151CF1784912441EBFFF45FA91ADFBDF105147C01595 |

Portable self-extractor and NSIS installer both built successfully. Packaged
`release/win-unpacked/ShortCut Studio.exe` launched, opened the 1080p benchmark
project, sought to source timestamp 1 second, advanced actual playback and showed
no UI errors. Captured playhead dragging outside the ruler also passes against
the packaged 1080p project. Live rotation updates before blur and Escape restores
the original value in the packaged runtime. No Vite/dev server. Installer execution and clean-machine install/
uninstall were not tested. Portable wrapper extraction was not separately automated.
Artifacts are unsigned and require external FFmpeg/FFprobe; see FFMPEG-SETUP.md.

Final package command used session-local `ELECTRON_BUILDER_COMPRESSION_LEVEL=1`
for faster compression. Standard `npm run package` produces equivalent app code
with default compression and potentially different file sizes/hashes. No binaries
are committed. Updated source and tests remain in the working tree.

Current production bundle: `dist/assets/index-B9V44-Je.js`.

Verification: production build; 60 Vitest tests; 15 desktop Playwright tests;
packaged runtime smoke; formatting. Runtime dependency audit from prior milestone found zero issues; no new dependencies added.
One earlier package attempt hit Windows EBUSY while accessing the executable;
retry after lock release succeeded. No test failure was classified as passed.

Full phase reports: phase-reports.md. Known limitations and next work:
AGENT_HANDOFF.md and roadmap.md. Performance details: testing.md and
benchmark-latest.json.

Timeline fix details and test limits: timeline-fix-report.md.

Current audit and continuation: PRODUCT_AUDIT.md and DEVELOPMENT_STATUS.md.
