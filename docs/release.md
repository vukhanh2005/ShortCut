# ShortCut Studio 0.1.0 local build

Built 2026-10-10. Functional foundation, not production-qualified full editor.

| Artifact                                  |     Bytes | SHA-256                                                          |
| ----------------------------------------- | --------: | ---------------------------------------------------------------- |
| release/ShortCut-Studio-0.1.0-Windows.exe | 137115175 | 2702B062786056AD202958B1C6F59731AFF63725364BFC6FF613E8A2D6FBC641 |
| release/ShortCut-Studio-0.1.0-Setup.exe   | 137325603 | B6C01A4154868D61B79B2695C8913D1C3231305F07AC6B918A15B4C89DA1F2F3 |

Portable self-extractor and NSIS installer both built successfully. Packaged
`release/win-unpacked/ShortCut Studio.exe` launched, opened the 1080p benchmark
project, sought to source timestamp 1 second, advanced actual playback and showed
no UI errors. No Vite/dev server. Installer execution and clean-machine install/
uninstall were not tested. Portable wrapper extraction was not separately automated.
Artifacts are unsigned and require external FFmpeg/FFprobe; see FFMPEG-SETUP.md.

Final package command used session-local `ELECTRON_BUILDER_COMPRESSION_LEVEL=1`
for faster compression. Standard `npm run package` produces equivalent app code
with default compression and potentially different file sizes/hashes. No binaries
are committed. Source, lockfile, icon and packaging configuration are committed.

Verification: production build; 29 Vitest tests; 3 desktop Playwright tests;
packaged runtime smoke; formatting; runtime dependency audit (zero findings).
One earlier package attempt hit Windows EBUSY while accessing the executable;
retry after lock release succeeded. No test failure was classified as passed.

Full phase reports: phase-reports.md. Known limitations and next work:
AGENT_HANDOFF.md and roadmap.md. Performance details: testing.md and
benchmark-latest.json.
