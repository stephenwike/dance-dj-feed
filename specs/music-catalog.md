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

## Seeding

```
node scripts/catalog/seed-musicbrainz.js --artist "Steve Earle" [--artists-file list.txt] [--max-per-artist 300] [--isrcs] [--dry-run]
```

- Needs `MUSICBRAINZ_CONTACT` (email or URL), which goes in the User-Agent as MusicBrainz requires.
- Requests are spaced at about 1/second (their limit), with a backoff on 503.
- `--isrcs` does one extra lookup per recording.
- Re-runs are safe: tracks upsert by id, and ISRCs accumulate.

## Search

`GET /api/catalog/search?q=…&limit=…` is public (listed in the middleware).

- Every word must match; the last word may be partial.
- Queries shorter than 2 characters return nothing.
- Versions of one song (same normalised title + artist) collapse to the highest-ranked one.
- Responses are cacheable for 60s.
- Only display fields are returned.

Scale: prefix search with an in-memory rank sort suits up to hundreds of thousands of tracks. A full MusicBrainz import (tens of millions) would need a search engine such as Atlas Search.

## Requests

The partner form's Song field searches the catalog. Picking a result sends `catalogTrackId`. On create, the server looks the track up and copies `songName`, `artist`, `duration_ms` (unless one was given) and `isrcs` onto the request, and stores `catalogTrackId`. Unknown ids are ignored. Typing without picking still sends a free-text song.

The local-files plugin uses `isrcs`, `duration_ms` and `catalogTrackId` for matching (see `local-files-plugin.md`).
