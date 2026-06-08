import { useState } from 'react';
import sp from '../../pages/dj-spotify/dj-spotify.module.css';

function fmtMs(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function SpotifyPanel({ data, onControl, connected, error, onRetry }) {
  if (!connected) {
    return (
      <div className={sp.spotifyPanel}>
        <p className={sp.spotifyNotConnected}>Spotify not connected</p>
        <a href="/api/spotify/auth" className={sp.connectBtn}>Connect Spotify</a>
      </div>
    );
  }
  if (error?.toLowerCase().includes('no active device')) {
    return (
      <div className={sp.spotifyPanel}>
        <p className={sp.spotifyNotConnected}>No active Spotify device</p>
        <p className={sp.spotifyHint}>Open Spotify on any device, then retry.</p>
        <div className={sp.spotifyControls}>
          <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" className={sp.connectBtn}>Open Spotify</a>
          <button className={sp.retryBtn} onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  }
  const pb = data?.playback;
  const track = pb?.item;
  const isPlaying = pb?.is_playing;
  const progress = track ? (pb.progress_ms / track.duration_ms) * 100 : 0;
  return (
    <div className={sp.spotifyPanel}>
      <div className={sp.spotifyTrackRow}>
        {track?.album?.images?.[2] && <img className={sp.albumArt} src={track.album.images[2].url} alt="" />}
        <div className={sp.spotifyTrackInfo}>
          <span className={sp.spotifyTrackName}>{track?.name ?? 'Nothing playing'}</span>
          <span className={sp.spotifyTrackArtist}>{track?.artists?.map(a => a.name).join(', ') ?? ''}</span>
        </div>
        <span className={sp.spotifyDuration}>{track ? `${fmtMs(pb.progress_ms)} / ${fmtMs(track.duration_ms)}` : ''}</span>
      </div>
      {track && (
        <div className={sp.spotifyProgress}>
          <div className={sp.spotifyProgressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className={sp.spotifyControls}>
        <button className={sp.ctrlBtn} onClick={() => onControl('previous')}>⏮</button>
        <button className={`${sp.ctrlBtn} ${sp.ctrlBtnMain}`} onClick={() => onControl(isPlaying ? 'pause' : 'play')}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className={sp.ctrlBtn} onClick={() => onControl('next')}>⏭</button>
      </div>
    </div>
  );
}

export function SpotifySearch({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    const data = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => []);
    setResults(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  if (!open) return <button className={sp.searchToggle} onClick={() => setOpen(true)}>+ Add from Spotify</button>;
  return (
    <div className={sp.searchPanel}>
      <form onSubmit={search} className={sp.searchForm}>
        <input className={sp.searchInput} value={q} onChange={e => setQ(e.target.value)} placeholder="Search Spotify…" autoFocus />
        <button type="submit" className={sp.searchBtn} disabled={loading}>{loading ? '…' : 'Search'}</button>
        <button type="button" className={sp.searchClose} onClick={() => { setOpen(false); setResults([]); setQ(''); }}>✕</button>
      </form>
      {results.length > 0 && (
        <ul className={sp.searchResults}>
          {results.map(t => (
            <li key={t.id}>
              <button className={sp.searchResult} onClick={() => { onAdd(t); setOpen(false); setResults([]); setQ(''); }}>
                {t.image && <img src={t.image} className={sp.searchThumb} alt="" />}
                <div className={sp.searchResultInfo}>
                  <span className={sp.searchResultName}>{t.name}</span>
                  <span className={sp.searchResultArtist}>{t.artists}</span>
                </div>
                <span className={sp.searchResultDur}>{fmtMs(t.duration_ms)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
