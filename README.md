# ShortCut Studio

Windows desktop video editor. Local media, local processing, no account.
Functional 0.1 foundation; not yet a fully qualified production release.

## Run

Open `release/ShortCut-Studio-0.1.0-Windows.exe` (portable), or install with
`release/ShortCut-Studio-0.1.0-Setup.exe`. Node is not needed for packaged builds.
FFmpeg and FFprobe are required on PATH; see [setup](docs/FFMPEG-SETUP.md).
These packages are unsigned. FFmpeg CLI binaries are not bundled.

## Working features

- Real video/audio/image import, thumbnails, waveforms and optional 720p proxies.
- Multitrack editing: move, trim, split, ripple, linked clips, undo/redo, snapping.
- Actual layered playback, audio gain, static transforms and fade in/out.
- Unicode text/subtitles, SRT import/export, manual styling and timing.
- Versioned project save/open, relinking, recent files and recovery autosave.
- Real H.264/AAC export with audio mixing, captions, progress and cancellation.

Static crop, captured frame scrubbing, linked layer transfers and explicit audio
separation are supported. Crossfade/slide/zoom transitions, keyframes and
transcription remain planned.
Preview typography/audio timing has documented limits. Full phase status:
[phase reports](docs/phase-reports.md).

## Development

Node 24+, FFmpeg and FFprobe on PATH. `npm ci`, `npm run dev`.
`npm run check` builds and tests. `npm start` runs the production build.
`npm run package` creates portable Windows executable and NSIS installer.

Implementation and verification status: [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md).

Current development audit: [PRODUCT_AUDIT.md](docs/PRODUCT_AUDIT.md).
Verified progress and remaining work: [DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md).
Audio inspector includes persisted clip mute and clip/track gain in dB. Recent
hardening protects delayed save/open, recovery ordering, relink and buffering.
