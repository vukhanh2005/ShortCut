# Remaining release work

P0 hardening: sample-locked audio transport, sustained seek/playback stress tests,
export to filesystems without hard links, missing-file/relink stress coverage,
safe parallel save/recovery fault injection, rotated/VFR media fixtures, and
clean-machine installer qualification with documented FFmpeg provisioning.

P1: source-handle-aware crossfade/dissolve/slide/zoom transitions;
preview transform handles; precise browser/libass text-layout parity; independent
audio fades; independent export resize/FPS overrides;
recent audio history and in-app cache cleanup.

P2: linear keyframes shared by preview/render, explicit decoded frame cache,
persisted proxy references, batched/chunked rendering above 64 inputs,
local Whisper transcription, export job queue and broader media-format fixtures.

Qualification: clean Windows 10/11 install/uninstall, code signing, accessibility
review with screen reader, GPU success-path tests on supported NVENC driver,
real-world 1080p footage benchmarks and long-edit memory profiling. NVENC trial
and short successful GPU export were verified on RTX 2050; broaden driver coverage.

No unfinished feature is represented by an enabled placeholder control.
