# FFmpeg prerequisite

ShortCut Studio 0.1 includes the desktop runtime. It does not bundle FFmpeg or
FFprobe command-line executables. Node/npm are not needed to run packaged app.

Install a trusted Windows FFmpeg build with `ffmpeg.exe` and `ffprobe.exe` on PATH,
then restart ShortCut Studio. Alternatively, place both executables in a `tools`
folder beside the installed `ShortCut Studio.exe` in the unpacked or installed
application directory. The portable self-extractor runs from a temporary folder;
use PATH for that distribution.

Required features: H.264 decoder, libx264 encoder, AAC encoder, libass subtitles,
scale/overlay/rotate/fade filters, audio mixing. Verified with Gyan FFmpeg 8.1.1
Essentials. Source format support follows the installed build. Unsupported preview
codecs can use Make 720p proxy in a media card's Manage section.

Check installation in a terminal:

```powershell
ffmpeg -version
ffprobe -version
```

Missing tools produce a visible error. Export is disabled until tools are available.
NVENC may be absent or fail at runtime; CPU fallback is supported. This machine's
RTX 2050 passed a 640x360 runtime trial and an actual GPU export test. The initial
128x128 trial was below the encoder minimum; that false negative was corrected.

FFmpeg download/build information: https://ffmpeg.org/download.html
FFmpeg license information: https://ffmpeg.org/legal.html

Do not redistribute a downloaded FFmpeg build casually. This machine's FFmpeg
enables GPL/version3 and libx264; redistribution needs its exact applicable
licenses, notices, corresponding source and other obligations. No FFmpeg CLI
binary is included in this repository or these application packages.
