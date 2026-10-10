# Development

Verified toolchain: Windows, Node 24.19.0, npm 11.17.0, FFmpeg/FFprobe 8.1.1.
Electron 44.7.0, React 19.3.0, Vite 8.3.4, TypeScript 7.0.2 strict mode,
Zustand 5.0.15, Vitest 5.0.3, Playwright 1.64.0. Versions locked by npm.

1. Install Node and FFmpeg/FFprobe as described in FFMPEG-SETUP.md.
2. `npm ci`. If local npm policy skips Electron's install script, run
   `node node_modules/electron/install.js` explicitly.
3. `npm run dev` compiles main/preload, starts loopback-only Vite and opens Electron.
   Renderer has hot reload; restart command after native-service changes.
4. `npm run check` builds production files and runs domain/native tests.
5. `npm run test:e2e` tests the production Electron app without a dev server.
6. `npm run format` and `npm run format:check` use Prettier.
7. `npm run package` builds portable EXE and per-user NSIS installer.

`npm start` opens the last production build. `node scripts/benchmark.mjs` builds
synthetic one-minute 1080p workload after `npm run build` and records measurements.
`powershell -NoProfile -File scripts/create-icon.ps1` regenerates original branding.

Tests keep fixtures under temporary directories or ignored `.cache/`; screenshots
are in ignored `test-results/`. Generated exports never overwrite source files.
No real user media is needed. Avoid multiple test runs writing shared screenshot
paths at once. Native tests require a build with libx264, AAC and libass.

## Security boundaries

Renderer is sandboxed, Node integration disabled, context isolation and CSP on.
Preload exposes named operations, no generic process/filesystem API. IPC requires
the main frame of the app window. Native dialogs authorize project/output paths.
Media protocol serves opaque IDs for imported files; arbitrary paths are not URLs.
Navigation, popups and permission requests are denied. Network services are not
used in production. Electron's bundled Chromium includes its own codec library;
that is separate from the external FFmpeg command-line binaries.

## Architecture deviation

Electron replaces preferred Tauri/Rust because Rust was absent. It provides a
working Windows package on the installed Node toolchain. Domain/render/service
boundaries keep a later Rust service port possible, but no unused adapter layer
was added. Native CSS replaces Tailwind; no component framework is necessary for
this compact editor. Rust tests do not apply to this implementation.
