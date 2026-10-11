# Render pipeline

`Project -> validate -> authorized media -> RenderPlan -> FFmpeg -> FFprobe -> publish`

`electron/render.ts` builds an intermediate plan containing argument arrays,
filter graph, ASS captions and output expectations. Renderer components never
construct process commands. Child processes use spawn with shell disabled.

Each clip input uses source in/out. PTS and atempo implement speed. Video is fit
to project resolution, scaled, cropped, flipped, rotated, faded and composited at its
timeline offset over a black base. Hidden video can still contribute audio;
mute controls sound separately. Audio uses gain, fades, sample-accurate delays,
mixing and a final peak limiter. Blank intervals remain black/silent. Captions
burn through libass using generated UTF-8 files. Cut and clip fade in/out work;
crossfade, dissolve, slide, zoom transitions and keyframes are not implemented.

Output is MP4/H.264/AAC with faststart. CPU libx264 is always available when the
required FFmpeg build is installed. NVENC is offered only after an actual trial
encode; runtime failure retries CPU unless cancelled. Quality presets map to CRF
or NVENC CQ. Output canvas/FPS come from the project, with custom values available
at project creation. There is no independent output resize panel yet.

Temporary output lives beside the destination. After validation, a hard link
publishes it without replacing existing data, then the temporary name is removed.
Existing destinations are rejected, even if a save dialog confirms replacement.
This protects sources and concurrent exports. NTFS is supported; filesystems
without hard-link support (such as FAT/exFAT) currently reject final publication.
Cancellation kills FFmpeg, waits for termination and cleans temporary artifacts.
Normal app exit waits for export cleanup. An OS kill can leave hidden partial
files; no claim of cleanup after power loss.

FFprobe checks size, H.264 stream, resolution, FPS, duration within max(150 ms,
two frames), and AAC when audible output is expected. Integration tests decode
pixels at cuts/layers/captions and measure PCM audio energy; zero exit alone
does not count as successful validation.

## Preview parity and limits

Preview uses active HTML media elements only, capped at 12 decoders, plus CSS
composition. A monotonic animation clock pauses while active decoders seek or
buffer. Media seeks map through the same clip model; drift correction threshold
is max(40 ms, one project frame). Web Audio gain supports 0..200%. This is a
practical browser preview, not a sample-locked professional audio transport.

Text uses browser fonts/CSS in preview and libass in export. Font metrics,
wrapping, outline/shadow thickness and box geometry can differ slightly. Literal
ASS override braces are neutralized in exported text. Safe-area/selection guides
do not export. Audio export limiter can differ from simultaneous preview peaks.
No frame-exact decoded frame cache exists yet; browser buffering is used.
Proxies normalize unsupported browser codecs and reduce resolution to 720px.
Final export always reads originals.

Static crop uses RGBA crop plus transparent padding back to the fitted dimensions,
so preview CSS inset and export preserve the same center and expose lower layers.
Export rounds crop edges to output pixels (at least one pixel remains). Browser
subpixel edges and FFmpeg pixel rounding can differ at boundaries. Both paths
honor `audioEnabled`; separated sound contributes only once. Native layer tests
split a red/440 Hz then blue/880 Hz source, overlap its segments, verify rendered
pixels, reverse track order, exercise crop/scale/rotation/position/opacity, and
measure both frequencies before/during/after the overlap.

Mixer: effective audio gain is clip.volume * (track.volume ?? 1) * fade envelope.
Track mute, clip mute or audioEnabled=false suppress sound independently of picture
visibility. Browser uses GainNode; FFmpeg uses volume and existing fades/limiter.
When any active browser decoder seeks or buffers, all active media pause with the
project clock and restart together after readiness. This reduces drift around
stalls; independent browser clocks still require long-run qualification.
