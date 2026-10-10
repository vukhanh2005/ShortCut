# Third-party notices

Original application code: MIT, see LICENSE. Branding and synthetic test footage
were generated locally; no proprietary editor assets or commercial media libraries.

Runtime packages: React/React DOM (MIT), Zustand (MIT), Lucide (ISC), Electron
(MIT plus Chromium and bundled third-party licenses). Electron-builder preserves
LICENSE.electron.txt and LICENSES.chromium.html in the Windows distribution.
Package licenses are retained in app.asar for distributed dependencies.

Build/test tools include Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT),
Playwright (Apache-2.0), Prettier (MIT), electron-builder (MIT). Consult installed
package license files and lockfile for exact transitive components.

External FFmpeg CLI is not redistributed. See FFMPEG-SETUP.md before bundling it.
System fonts are referenced by name, not bundled. Font availability affects
caption appearance. Patent and jurisdiction-specific distribution obligations
require a separate release review; this file is not legal clearance.

Executed dependency audit: runtime packages have zero reported vulnerabilities.
Full npm audit reports eight moderate findings in electron-builder's transitive
build-tool chain (sprintf-js precision DoS and affected dependents). No fixed
sprintf-js release was available from registry at inspection. These are tracked
as packaging-tool debt; no forced downgrade or untested dependency override applied.
