# Workflow: Local Files Playback

**Actor:** DJ (signed in, using Chrome or Edge on the computer connected to the speakers)  
**Entry point:** `/dj-controller` (sessions with the Local Files plugin)  
**Outcome:** The controller plays the queue from a music folder on the DJ's computer and advances when each song ends.

---

## Preconditions

- A session with `plugin: 'local-files'`, chosen in **Settings → Music Source** (locked while a track is playing)
- Chrome or Edge. Other browsers get a full-screen notice; they can still be used as a remote for a computer that is playing.

---

## How This Differs From Standard and Spotify

| Feature | Standard | Spotify | Local Files |
|---|---|---|---|
| Who plays the audio | The DJ, from anything | Spotify app | The controller tab |
| Track advancement | Timer countdown | Spotify polling | Audio `ended` event (timer if no file) |
| Playback controls | RemoteControl | Spotify panel | RemoteControl (the audio follows the queue) |
| Add tracks | Add to Queue panel | Spotify search | Music-folder search |
| `advancedBy` stamp | `'standard'` | `'spotify'` | `'local-files'` |

---

## Music Folder

1. DJ clicks **Choose music folder** (browser folder picker). Nothing is uploaded.
2. The controller walks the folder for audio files (mp3, m4a, aac, wav, flac, ogg, opus, webm) and reads their tags. Untagged files fall back to `Artist - Title.mp3` filenames.
3. The folder handle and the index are kept in IndexedDB. On later visits the cached index shows at once and a background rescan only re-reads files whose size or modified time changed.
4. After a reload the browser requires a click to re-grant access (**Allow access**).

---

## Privacy

- **Browser folder access:** the browser only exposes the chosen folder's name and paths inside it, never the full path on disk. The DJ grants read access, the browser asks again after a reload, and access can be revoked in site settings.
- **Stays on the computer:** the folder handle, the scanned index, and the DJ's remembered file choices are kept in that browser's IndexedDB (`libraryStore.js`). Audio is never uploaded.
- **Per DJ account:** that stored data is keyed by the signed-in DJ's id, so DJs who share a computer and browser profile keep separate folders and choices. Data saved before this was keyed per DJ goes to the first DJ who opens the plugin in that browser.
- **`localTrackKey` on the server:** this path inside the folder is saved on requests so a pinned file survives reloads. It is DJ-only: `redactForViewer` and the create response strip it for everyone but the session's DJ (`DJ_ONLY_FIELDS` in `requestAccess.js`). Attendees can't set it.

---

## Matching Requests to Files

The strongest evidence wins (`explainMatch` in `library.js`). Every queued card and the now-playing card show their file and how it was found (`TrackFileRow`, the plugin's `queueItem` slot). The card border is **red** when no file was found and **amber** for a guess (the plugin's `itemTone`). **Find file** / **Change** opens a panel listing the 3 closest files with a match %, above a search of the library.

| Method | Label | Meaning |
|---|---|---|
| Assigned | chosen by you | The request's `localTrackKey`, set with **Find file** / **Change file** / **✓ Confirm** |
| Linked | your file for this | A file the DJ chose before for the same **dance** (for a song swap or partner request: the same **song**) |
| ISRC | exact recording | A file whose ISRC tag matches the request's `isrcs` (from the music catalog, or the dance's song in `ldco`) |
| Name | matched by name | Normalised title must match, and the artist must match, contain, or be missing. Among equals, the file within 3s of the request's length wins |
| History | suggested (played for this before) — not saved yet | The file most played for this dance. Its own plays count 4× a swap played for it |
| Suggested | suggested — not saved yet | Closest fuzzy match on title (tag **or filename**, 60%), artist (25%) and length (15%). Failing that, the top result of the same search **Find file** runs (title words anywhere in the tags or path). Never a file tagged with a different artist |

The last two are **suggestions**. They play automatically without saving anything. They are shown in amber with **✓ Accept**, which saves the association (and pins the file to the request). Match results are cached per request until the library or the DJ's memory changes. Song swaps use the swap song.

Before comparing, titles drop release-variant notes (e.g. "- 2008 Remaster", "- Radio Edit", "- Single Version") but keep ones naming a different recording (live, acoustic, remix). Dropped g's count as the same word ("rockin'" = "rocking"). A file with no artist tag is checked against its folder names, and a line dance's name counts as a second title.

A request with no match at all is timed, not played: it advances after its `duration_ms`, like Standard.

## The DJ's Local Memory

This lives only in the DJ's browser, per DJ account (`libraryStore.js`), and never goes to the server. Keys are defined in `requestIdentity.js`:

- **Identity keys:**
  - `dance:<danceId>`: a catalog line dance
  - `dance-name:<name>`: a typed line dance
  - `song:<catalogTrackId>`: a catalog song
  - `song-name:<title>|<artist>`: a typed song
- **Links** (explicit, "use this file every time"): saved when the DJ picks or confirms a file. A line dance links its **dance**, plus its catalog song when it names one exactly. A swap or partner request links only its **song**, so a swap never changes the dance's usual file.
- **History** (loose): each file that actually plays is recorded under the dance and under the song, with swap plays counted separately. This covers "songs played for this dance before", swaps included. Unconfirmed fuzzy guesses aren't recorded, so a wrong guess can't reinforce itself. The 20 most recent files are kept per key.

Links from before identity keys (bare catalog ids) are read as song keys.

---

## Playback

The queue in the database is the source of truth; the player follows the playing request:

- `playStartedAt` sets the position (re-seeks only when the audio drifts more than 2s)
- `pausedAt` pauses
- a new playing request loads its file

So pause, resume, restart, ±time and skip all use the existing RemoteControl actions, from this tab or from any other device.

When a song ends, the player re-reads the queue, checks the session is still active and the song is still the playing one, then marks it played and starts the next (stamped `advancedBy: 'local-files'`, which the feed timers ignore).

If the browser blocks autoplay (for example after a reload mid-song), the panel shows **Start audio**.

### Multiple sessions

The player belongs to the session whose track it holds. Switching the controller to another session leaves that music playing, and its queue keeps advancing. A second Local Files session waits until the player is idle, or until the DJ clicks **Play this session instead**. Closing the owning session stops the music.

---

## Floor Remote (phones)

On phone-sized screens (≤ 640px) the controller opens on the **Floor Remote** (`components/dj-controller/FloorRemote.js`), a full-screen panel with:
- what's playing and its countdown
- big restart / −10s / pause-resume / +10s / skip buttons (through the queue, like the desktop controls)
- the plugin's `remoteControls` slot: for Local Files, Tempo and Volume (`RemoteMix.js`)
- the next three tracks

✕ closes it to reach the full controller, where narrow screens show one column at a time. The 🎛️ **Remote** and 🎵 **Queue** buttons in the sidebar strip switch between them.

Fades, In/Out and Save to track stay on the computer playing the music: they act on its audio engine and its local storage.

## Mixing Controls

Shown in the queue panel on the computer playing the music.

- **Tempo** (75%–125%, pitch preserved), for the current track only; each new track starts at 100%. It is stored on the request as `tempo`. The server's `joinDurations` serves `duration_ms` as wall-clock time (`duration / tempo`), so countdowns, queue ETAs and the feed stay correct without knowing about tempo. Changing tempo also moves `playStartedAt` so the song keeps its place (`lib/dj/tempo.js`).
- **Fade → Next**: a 5s crossfade into the next track, which advances the queue straight away.
- **Fade out**: fades over 5s, then pauses the track in the queue. Resuming plays at full volume.
- **Crossfade** (Off / 3s / 6s / 10s): starts the next track that many seconds before the current one ends, with equal-power curves. It only applies when the next track's file is already loaded, and never on tracks shorter than 3× the crossfade.
- **Speakers**: sends audio to a chosen output device (`setSinkId`). Chrome only names devices after a microphone permission prompt; nothing is recorded.

- **Volume** (−12 to +12 dB), for the playing track. It can boost quiet songs as well as cut loud ones. Like tempo, it is stored on the request (`volumeDb`, `lib/dj/volume.js`), so any device can change it and the computer playing the music applies it on its next sync. When a file with a saved tempo/volume starts, the player writes those values to the request, so other devices show the real values.
- **Timeline** (`TrackTimeline.js`): the playing file's waveform, decoded once per file version at a low sample rate (`decodeWaveform.js`) and cached per DJ in IndexedDB as 600 loudness points (0..255). Drag the green **Start (In)** and amber **Fade (Out)** handles; click elsewhere to jump there (the queue's clock moves too, so remotes follow). Handles snap to the track's start/end and to where the sound starts/ends (dashed lines, detected from the waveform). Regions that won't play are dimmed, and the fade after Out is shaded. Handles stay at least 10s apart; dragging a handle back to the start or end clears it.
- **Start (In)**: where the track starts. It applies the next time the track plays (this play has already started); the track then fades in over 1.5s, and the queue's clock counts from the In point.
- **Fade (Out)**: where the fade (or crossfade) to the next track starts. It applies live, when playback next *crosses* the point, so setting it just behind the playhead doesn't fade at once. The fade length is the crossfade setting, or 5s when crossfade is off. At the end of the queue it fades out instead of cutting.
- **Save to track**: stores volume, In/Out and the current tempo **for that file**, locally per DJ (`trackSettings` in `libraryStore.js`). They apply whenever the file plays; a saved tempo applies unless the request already has one. **Revert** returns to the saved settings. Saving the defaults removes the entry.

When a file (or its In/Out points) makes a track play longer or shorter than the queue assumes (by more than 1.5s), the player PATCHes the request's `playLengthMs`. `joinDurations` prefers it, so the feed's countdown and queue ETAs match what actually plays.

Audio runs through Web Audio (`Deck.js`): element → trim gain (volume) → fader gain (fades, scheduled by the audio engine) → one shared `AudioContext`. Speakers are chosen with `AudioContext.setSinkId`. The player (and its audio context) is only created once the Local Files plugin is used.

Crossfade length and speakers are per-computer preferences, kept in `localStorage`.

The player has two decks. One plays the current track; the other preloads the next track's file, so changes are gapless even with crossfade off. During a crossfade the second deck carries the outgoing track.

---

## Plugin Architecture (all plugins)

`components/dj-controller/plugins/registry.js` lists plugin descriptors: `{ id, label, description, adapter, useRuntime, slots }`. The controller never branches on plugin ids; it renders the active plugin's components into named slots (`PluginSlot.js`):

| Slot | Where |
|---|---|
| `sidebarStatus` | Bottom of the sidebar |
| `overlay` | Covers the controller body |
| `queueHeader` | Top of the queue column |
| `player` | Replaces the default RemoteControl |
| `queueFooter` | Below the queue |

Adding a plugin means adding a descriptor to the registry and its id to `SESSION_PLUGINS` in `lib/dj/sessionPricing.js`.

---

## Known Limitations / Follow-ups

- Chrome/Edge only (File System Access API).
- Controls respond after the queue PATCH and refetch (typically well under a second), not instantly.
- The feed's countdown uses the catalog `duration_ms`, which can differ slightly from the file's real length.
- Tempo is per track; there is no remembered per-song tempo yet.
