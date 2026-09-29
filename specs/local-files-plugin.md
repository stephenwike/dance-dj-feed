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

## Matching Requests to Files

A request plays the file named by its `localTrackKey` (path relative to the music folder) if that file exists. Otherwise it is matched by song:

- Title must match exactly after normalising (case, accents, punctuation, `(Radio Edit)`-style suffixes and `feat.` credits are ignored). Song swaps use the swap song.
- If the request names an artist, the file's artist must match it, contain it (or be contained by it), or be missing. The same title by a different artist is treated as a different recording.
- Without an artist, only a title that matches exactly one file is used.

The queue panel shows the file chosen for **Now** and **Next**. **Find file** / **Change file** pins a file by setting `localTrackKey`. A request with no file is timed, not played: it advances after its `duration_ms`, like Standard.

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

## Mixing Controls

Shown in the queue panel on the computer playing the music.

- **Tempo** (75%–125%, pitch preserved), for the current track only; each new track starts at 100%. It is stored on the request as `tempo`. The server's `joinDurations` serves `duration_ms` as wall-clock time (`duration / tempo`), so countdowns, queue ETAs and the feed stay correct without knowing about tempo. Changing tempo also moves `playStartedAt` so the song keeps its place (`lib/dj/tempo.js`).
- **Fade → Next**: a 5s crossfade into the next track, which advances the queue straight away.
- **Fade out**: fades over 5s, then pauses the track in the queue. Resuming plays at full volume.
- **Crossfade** (Off / 3s / 6s / 10s): starts the next track that many seconds before the current one ends, with equal-power curves. It only applies when the next track's file is already loaded, and never on tracks shorter than 3× the crossfade.
- **Speakers**: sends audio to a chosen output device (`setSinkId`). Chrome only names devices after a microphone permission prompt; nothing is recorded.

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
