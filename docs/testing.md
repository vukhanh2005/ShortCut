# Executed validation

Build: TypeScript strict renderer/native compilation and production Vite build.

Vitest: 29 tests passed across timeline, native integration and foundation tests.
Includes all 15 requested ripple scenarios, lock/boundary rejection, source
preservation, linked split, undo/redo, frame arithmetic, snapping, Unicode SRT,
schema rejection, actual FFprobe import, real thumbnails/waveforms, atomic save
backup/interrupted-temp handling, render pixel/audio checks, in-flight cancellation,
missing source failure and preservation of an existing output. Media byte-range
tests check partial responses, suffix ranges, HEAD and rejected invalid ranges.
NVENC trial and actual GPU export pass on this host's RTX 2050. Initial trial
resolution was too small; 640x360 fixes false unavailability detection.

Playwright: 3 Electron tests passed. Production launch and 1366x768/1920x1080 checks;
drag/drop placement, move, trim, resizable panel and input focus; eight-video
workflow with split, ripple delete, undo/redo, trim, narration, SFX, Vietnamese
caption, playback, save, close/reopen and MP4 export. Native dialogs are replaced
inside the test Electron process with predetermined fixture paths. Actual import,
filesystem writes, preview media and FFmpeg processes remain real.

Latest full workflow run: 9.3 seconds; all 3 desktop tests 12.7 seconds on this
machine. These synthetic 160x284/320x568 checks are functional tests, not a claim
about 1080p performance. A separate 1080p benchmark records actual measurements in
benchmark-latest.json. Browser frame gaps do not measure audio accuracy
or guarantee presented-video FPS.

One-minute benchmark: eight 1920x1080 motion clips in 1080x1920 project, voice/music,
five SFX, ten captions and two titles. Measured load 1940 ms, first decoded frame
2120 ms, five seeks 43..172 ms, Electron working set 808 MiB, CPU export 32.22 s.
120 animation-frame samples: median 8.3 ms, p95 8.4 ms, max 33.5 ms. This is one
synthetic run on Intel i5-11400H (6 cores/12 threads), 16 GB RAM, RTX 2050 plus
Intel UHD Graphics; NVIDIA driver 32.0.16.1088. It is not a general guarantee. Packaging was
also running during this measurement. No export process peak-memory figure yet.

Benchmark found and fixed two bugs: missing CORS scheme support after Web Audio
gain integration, and missing byte-range responses preventing seeks in larger
files. Desktop playback test now asserts decoder readiness, exact source seek
and advancement from the initial media time, rather than a nonzero timestamp.

Visual QA: desktop, populated timeline/Unicode caption and completed export
screenshots inspected. Current output is in test-results (not tracked).

Packaged win-unpacked executable launches without development server and loads,
seeks and plays real 1080p project; package-smoke.json records checks.

Not claimed: clean-machine install, human listening test,
hardware frame-accurate playback, exhaustive codec/rotation/VFR coverage,
power-loss proof, advanced effects, screen-reader audit or production readiness.
