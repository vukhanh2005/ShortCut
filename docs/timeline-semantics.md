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
stays attached unless the user places the same source on an audio track and
links synchronized clips; there is no automatic detach-audio command yet.

## Transactions and history

Edits clone the project, validate the complete result, then commit atomically.
Invalid edits do not enter history. Undo/redo retains 50 project snapshots,
selection, playhead and active track. History is session-only. Properties apply
to the first selected clip; timing edits expand linked groups. Linked groups
require identical timeline starts and durations. Unlink permits independent edits.
Copy/paste preserves relative offsets and replaces group IDs. Paste requires
empty space on original unlocked tracks; it does not implicitly ripple.

## Ripple

Default is all-track scope. Active-track scope is selectable. Delete closes the
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

Library Add appends without ripple; audio and overlays therefore do not push
existing picture away. Timeline drag/drop is an explicit insert and honors
ripple. Manual caption creation and SRT import do not ripple other tracks.
Move never ripples; it rejects collisions. Snapping uses clip edges, playhead,
zero and an eight-screen-pixel tolerance, independent of zoom.

Fades apply to both picture opacity and audio gain. Trims clamp fade lengths;
split removes the fade at the new internal cut while preserving outer fades.

Limits: 32 tracks, 512 clips, 2000 assets, six-hour timeline. Export currently
limits media inputs to 64. These are explicit ceilings, not performance promises.
