# Music Catalog

**Purpose:** a song database attendees search when requesting partner dances, so requests carry an exact recording rather than free text.
**Code:** `lib/server/catalog/`, `pages/api/catalog/search.js`, `components/dj-request/CatalogSongPicker.js`, `scripts/catalog/`

---

## Storage

A separate Mongo database, `MUSIC_CATALOG_DB` (default `music_catalog`), with one `tracks` collection. It is deliberately not the shared `ldco` catalog, which other apps depend on. The document shape is documented at the top of `trackCatalog.js`.

Indexes: `search` (words + rank), `isrc`, `variant`.

## Data Source and Licence

MusicBrainz **core data** only: recording title, artist credit, length, ISRC. That data is CC0 and fine for commercial use. Tags and genres are CC BY-NC-SA (non-commercial) and must not be imported.

Deezer was ruled out: its developer terms (Section IV) forbid commercial use without a partnership.

## How the Catalog Grows

Mostly on demand (`lib/server/catalog/catalogSearch.js`). The seeding script only gives it a head start.

- **Nothing local** (query of 3+ characters): fetch from MusicBrainz now, store the results, then search again, so the attendee sees results on this keystroke.
- **Local results, specific query** (2+ words or 6+ characters): return the local results at once and fetch in the background. Without this, early partial matches (e.g. "Wagonmaster" stored while typing "wagon") would stop the real song ever being fetched.
- A query fetched in the last 10 minutes isn't fetched again. Identical concurrent searches share one fetch.
- **MusicBrainz limit:** one throttle per server process (about 1 request/second). A lookup that can't start within 1.5s is skipped, and the next search retries. Each lookup fetches up to 2 pages of 100 with a phrase-boosted query: exact-title matches all score the same, so the well-known version can be anywhere among them.
- Background fetches outlive the request, which suits a long-running Node server. On a serverless host they may be cut short (harmless; the next search retries).

## Ranking

MusicBrainz has no popularity signal. `rank` holds the **ListenBrainz listen count** (CC0; MetaBrainz asks commercial users to support them voluntarily). It is set only when a count was fetched, so an import without counts never erases one.

Search order:
1. Title relevance: the title is or starts with the query, then all words are in the title, then matches that needed the artist.
2. Listen count within each tier.
3. One row per song (normalised title + artist).

For example, "copperhead road" puts Steve Earle's studio recording (85k listens) above covers and live bootlegs.

## Seeding

```
node scripts/catalog/seed-musicbrainz.js --artist "Steve Earle" [--artists-file list.txt] [--max-per-artist 300] [--isrcs] [--dry-run]
```

- Needs `MUSICBRAINZ_CONTACT` (email or URL), which goes in the User-Agent as MusicBrainz requires.
- Pages are ranked by listen count as they are stored.
- `--isrcs` does one extra lookup per recording. On-demand fetches don't fetch ISRCs (search results don't include them).
- Re-runs are safe: tracks upsert by id, ISRCs accumulate, and ranks are only replaced by fresh counts.

## Search

`GET /api/catalog/search?q=…&limit=…` is public (listed in the middleware).

- Every word must match; the last word may be partial.
- Queries shorter than 2 characters return nothing.
- Non-empty results are cacheable for 10s, since a background refresh can re-rank within seconds. Empty results aren't cached.
- Only display fields are returned.

Scale: prefix search with an in-memory rank sort suits up to hundreds of thousands of tracks. Beyond that, use a search engine such as Atlas Search.

## Where Songs Are Searched

All of these use `useCatalogSearch` (`lib/client/catalog/`), so they share the catalog → MusicBrainz fallback.

| Place | Behaviour |
|---|---|
| Requester, **line dance** field | Dances first. Only when no dance in the whole catalog matches (not just ones available now), songs are offered. Picking one uses the song title as the dance name. |
| Requester, **song swap** | Song search. The swap's length and ISRC come from the picked song, never the dance's usual song. |
| Requester, **partner** Song field | Song search. |
| Controller Add to Queue, **Dance Name / Song / Artist** | Each box searches **every** field of the dance catalog, its own first. Dance Name lists dance-name matches, then dances whose song matches, then whose artist matches (`searchDancesAnyField`). A suggestion matched on another field says so ("song match"). Catalog songs only appear when no dance matches at all. Picking a song fills Song and Artist, and the Dance Name too if it's empty (always, when picked from the Dance Name box). |
| Controller **Edit request**: song swap, and partner Song/Artist | Song search in both boxes. Picking a song fills both and links the request to that recording: the edit endpoint resolves `catalogTrackId` to its ISRCs and length (`catalogTrackFields`). Editing the text unlinks it. |
| Controller Add to Queue, **partner** Song field | Song search, as in the requester app. |

Typing without picking still works everywhere; the text is sent as a free-text song.

## Requests

Picking a song sends `catalogTrackId`. On create, the server looks the track up and copies `songName`, `artist`, `duration_ms` (unless one was given) and `isrcs` onto the request, and stores `catalogTrackId`. Unknown ids are ignored.

Line dances from the dance catalog (`ldco`) get their song's ISRC, length and Spotify URI when requests are listed (`joinDurations`). Song swaps keep their own details instead.

The local-files plugin uses `isrcs`, `duration_ms` and `catalogTrackId` for matching (see `local-files-plugin.md`).
