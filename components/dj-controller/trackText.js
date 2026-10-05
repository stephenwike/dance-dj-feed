// How a request reads in a list: its title, and a second line with the song.

export function trackTitle(t) {
  if (t.danceType === 'message') return `💬 ${t.danceName}`;
  if (t.danceType === 'partner') return t.songName || t.partnerStyle || 'Partner Dance';
  return t.danceName;
}

export function trackSub(t) {
  if (t.danceType === 'message') return '';
  if (t.isSongSwap && t.swapSongName) return `↻ ${t.swapSongName}${t.swapArtist ? ` — ${t.swapArtist}` : ''}`;
  if (t.danceType === 'partner') return [t.partnerStyle, t.songName && t.artist].filter(Boolean).join(' · ');
  return t.songName ? `${t.songName}${t.artist ? ` — ${t.artist}` : ''}` : '';
}
