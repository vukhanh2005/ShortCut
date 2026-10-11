# Timeline semantics, schema 1

Canonical time is an integer microsecond. Clip intervals are half-open:
`[timelineStart, timelineStart + timelineDuration)`. Source mapping is
`sourceIn + (projectTime - timelineStart) * playbackSpeed`, rounded to integer
microseconds. `sourceOut - sourceIn` equals duration times speed within two
microseconds of rounding. Frame navigation computes each frame timestamp from
its absolute frame index, avoiding repeated rounding accumulation.

Tracks are exclusive: no overlaps inside one track. Separate video tracks
composite bottom to top (first listed track on top). Caption tracks always
composite above media, ordered among themselves. Images and text have synthetic
source intervals, independent of actual source duration. Audio from video clips
stays embedded across video-layer moves. Separate linked audio creates an audio
clip with the same source range, timing, speed, gain and fades, shares a group ID,
and disables embedded sound. Extract Audio creates the same independent audio
clip without a link. Unlink Audio breaks an existing group, or separates embedded
sound independently. Extraction uses an unlocked collision-free audio track or
creates one. Existing schema-1 video sources on audio tracks remain readable.
New video drops onto audio tracks are rejected with an Extract Audio hint.

## Transactions and history

Edits clone the project, validate the complete result, then commit atomically.
Invalid edits do not enter history. Undo/redo retains 50 project snapshots,
selection, playhead and active track. History is session-only. Properties apply
to the first selected clip; timing edits expand linked groups. Linked groups
require identical timeline starts and durations. Unlink permits independent edits.
Copy/paste preserves relative offsets and replaces group IDs. Paste requires
empty space on original unlocked tracks; it does not implicitly ripple.

Interactive properties use a shared store transaction: begin, update, commit or
cancel. Preview, inspector and timeline read `effectiveProject` (transient project
when present, otherwise committed project). Valid numeric input updates on each
change; incomplete strings stay local. Blur/Enter commits; Escape restores the
original value. Sliders commit on release. Text dragging coalesces pointer moves
with requestAnimationFrame, converts through the actual canvas scale, and shows
center alignment guides. Escape, pointer cancellation and lost capture restore
the original transform. A changed transaction adds one history entry; no-op
transactions add none. Selection and save settle pending edits. Export and
autosave consume committed data. A delayed open rejects intervening transient
edits as well as committed edits.

## Ripple

New projects default ripple OFF. Existing projects retain their saved mode.
The Ripple trim/delete checkbox controls trims, speed changes and clip deletion.
Default ripple scope is all tracks; active-track scope is selectable. Delete closes the
union of selected intervals from right to left. Insert shifts content beginning
at or after its insertion boundary. End trims and speed changes shift downstream
content by the duration delta. Ripple start trim keeps timeline start fixed,
changes source in and duration, and shifts followers by the duration delta.
Ordinary start trim moves the left edge and preserves the right edge.

Clips spanning a boundary or removed interval reject the entire operation.
Split spanning narration/music first, or select active-track scope. Downstream
locked content in all-track scope rejects the operation rather than silently
desynchronizing it. Active-track scope leaves unrelated tracks untouched; linked
group validation still rejects desynchronization. Multi-track ripple deletion
requires all-track scope. No overlap-consuming transition entities are accepted.

Library Add appends without ripple. Timeline drops default to Smart insert,
independent of the Ripple trim/delete checkbox. Insertion mode offers Smart,
Normal, Overwrite and Ripple. The domain insert command defaults to normal.
Normal insertion rejects occupied space on its destination track and never shifts
unrelated content. Smart insertion uses free space unchanged; a conflict inserts
before or after the target according to which half contains the pointer. If the
pointer is in free space but the proposed interval overlaps, the first overlapping
clip is the target. Smart insertion shifts the destination sequence and linked
partners, not unrelated tracks. Overwrite
consumes only the destination interval, retaining source-mapped left/right tails
with unique IDs and clamped fades. Linked overlaps must be explicitly unlinked
first. Ripple insertion retains boundary/lock validation. Manual captions and
SRT import do not ripple. Ordinary movement and track reassignment do not ripple.
Smart movement carries explicit target/side metadata. Same-track contiguous
selection closes its vacated span before reordering; gapped selections containing
unselected clips leave that source span unchanged. Group relative offsets and
source trims survive. Explicit Ripple mode uses the selected ripple scope.
Locked linked partners or collisions on partner tracks reject the whole proposal;
move to free space or unlock the affected track before retrying. Ghosts come from
the same validated engine command that commits on release.

One asset supports unlimited instances within the project clip ceiling. Every
insert gets a fresh clip ID; all instances reuse the same source asset/cache.

Fades apply to both picture opacity and audio gain. Trims clamp fade lengths;
split removes the fade at the new internal cut while preserving outer fades.

Limits: 32 tracks, 512 clips, 2000 assets, six-hour timeline. Export currently
limits media inputs to 64. These are explicit ceilings, not performance promises.

## Pointer editing and scrubbing

Scrub, move and trim use separate captured pointer interactions. The ruler's live
DOM origin includes horizontal scrolling; coordinates use current pixels/second.
Scrubs pause playback, quantize absolute frame indices and clamp to the last frame
strictly before the exclusive project end. Pointer release preserves that frame.
The handle also supports arrow keys, Home and End. Decode requests coalesce while
seeking; seek completion corrects to the latest target without changing playhead.

Vertical-only moves are valid. A transfer moves selected/linked clips on the
anchor's source track to a matching destination type; linked clips on other
tracks receive the same horizontal delta. For a vertical video transfer only,
if linked audio would collide on its original track, all selected audio from
that track moves to a compatible unlocked free audio track or a new audio track.
Unselected audio never moves. Automatic destinations match source track gain/mute;
new tracks inherit them. Link IDs, source ranges and synchronization remain. All source,
linked and target locks, collisions and source ranges validate atomically. Moves
never extract sound. Ghosts show the proposed validated positions, including
linked/ripple changes. Invalid proposals show a reason and cannot commit. Escape
or pointer cancellation cancels a clip edit. Release outside a track rejects it.

Static media crop is normalized per edge, applied before flip/rotation around the
original fitted canvas center. It reveals lower layers without changing timing.

## Multi-selection

Empty-lane dragging captures a rectangular marquee; model clip bounds are tested
in timeline-content coordinates using current scroll and zoom. Selection updates
live, includes linked partners, and excludes groups with locked members. Ctrl or
Meta adds to the selection; Escape/capture loss restores the previous selection.
Empty clicks clear and seek. Shift-click selects a range within the anchor track.
Clip moves, trims and playhead drags remain separate pointer interactions.

Media-library selection is independent of timeline instances. Ctrl/Meta toggles,
Shift selects a displayed range, and empty-grid dragging selects a rectangle.
Dragging selected assets uses displayed library order and cumulative durations.
Mixed video/audio batches route each kind to a matching unlocked track, creating
one when needed. Single-kind incompatible drops still reject. One `insertMany`
command validates all placements and generated tracks atomically; undo removes
the entire batch. Library marquee has no automatic edge scrolling yet.

## Track management and drag transactions

Always-visible 28px creation zones sit above the first video track and below the
last audio track, including when that type has no track yet. Moving through an
existing compatible lane does not create tracks. Video/images use video zones;
audio uses audio zones. Domain insert/move commands accept an empty new track;
creation, placement, linked audio relocation and full validation form one edit.
Ghosts display proposed new video/audio tracks before release. Escape, pointer
cancel, invalid type, collision, lock or limit failure leaves no empty track.
Undo removes placement and generated tracks together; redo restores identities.

Drag modes distinguish playhead, move, trim-start, trim-end, library insertion
and track creation. Transition/keyframe drags remain unsupported because the
underlying entities are not implemented. One capture runs at a time. Edge scroll
uses a 32px edge band, elapsed-time-based velocity and live ruler coordinates.
Drop/end/Escape/unmount clean capture/scroll/ghost state. Timeline pointer capture
claims keyboard focus so inspector inputs do not swallow subsequent shortcuts.

Track deletion is its own `deleteTrack` command, never ripple. Empty tracks delete
immediately; populated tracks require confirmation naming the track and clip
count. Only owned content is removed. Surviving members of affected link groups
become unlinked with timing and source mapping unchanged. Deleting a locked track,
or unlinking a surviving partner on a locked track, rejects the entire edit.
At least one track must remain. Undo restores order, identity, content and links;
active-track selection falls back to a surviving track and restores on undo.

## Magnetic snapping and markers

Pure `snapTargets` / `resolveSnap` functions expose resolved time and target ID,
time, priority and label. Acquire within 10 screen pixels; hold the same target
through 13 pixels to avoid jitter. Rank fresh targets by distance, then priority
(zero/marker/guide, playhead, clip boundary), then time and stable ID. Movement
checks both anchor edges, excludes selected/linked clips, and never snaps a
vertical-only move horizontally. Trim checks the edited edge. Scrub excludes
itself and seeks through the frame clamp. At the exclusive project end, transport
still stops on its last valid frame rather than an out-of-range frame.

Magnet button and N toggle share persisted local editor preference, also stored
in projects for fallback. A local preference wins when opening another project.
Frame stepping ignores magnetism. Marker button adds a schema-1 optional marker
at playhead; click marker to seek, right-click to remove; edits support undo and
save/load. Markers remain absolute and do not ripple. Guide targets are accepted
by the pure API; no separate selected-guide editor is implemented.

## Waveform cache and rendering

FFmpeg decodes the first audio stream at 48 kHz signed 16-bit PCM while preserving
channels (up to 64). Per-channel absolute peaks and RMS are accumulated in
windows, then combined into a weighted RMS/maximum-peak pyramid. Opposite-phase
stereo does not cancel. Base window is at least 188 samples; 131072 total base
bins bound memory across channels. Long files therefore have coarser detail;
this is amplitude overview, not sample-level editing. Decode is streamed with
bounded carry and a five-minute timeout; import cancellation remains unavailable.

Versioned cache key includes source path, size, modification time and analysis
configuration. Cache data is validated and stale/malformed entries regenerate.
Identical instances share asset data; history shares immutable waveform caches
instead of copying arrays per edit. Serialized project JSON excludes waveform
and other runtime media fields. Old peak arrays remain readable; reopening media
regenerates current analysis. Same-size files with forged unchanged timestamps
cannot be detected by this cache key.

Timeline chooses a level by source samples per screen pixel, then draws only the
visible clip region using three SVG paths (channel centerlines, peaks, RMS).
Source time is `sourceIn + pixelOffset / zoom * playbackSpeed`, bounded by
sourceOut. Split, trim, speed and scrolling preserve source alignment. Amplitude
is not normalized per clip; silence remains flat. Peaks may spread within one
analysis bin at high zoom. More than stereo is supported in analysis but crowded
inside the fixed 32-unit drawing height; channel expansion is future work.
