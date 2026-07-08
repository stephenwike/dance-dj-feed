export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatTimestamp(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const DIFFICULTIES = ['Beginner', 'Beginner Hustle', 'Improver', 'Low Intermediate', 'Intermediate', 'Advanced'];

export const PARTNER_STYLES = [
  '2 Step', '3 Step', 'Waltz', 'Viennese Waltz', 'Foxtrot', 'Quickstep',
  'Tango', 'Nightclub 2 Step', 'West Coast Swing', 'East Coast Swing',
  'Lindy Hop', 'Cha Cha', 'Salsa', 'Hustle', 'Polka', 'Rumba', 'Bachata',
];

const DIFF_COLORS = {
  beginner: '#22c55e', improver: '#3b82f6',
  intermediate: '#f59e0b', advanced: '#ef4444',
};

export function diffColor(d = '') {
  const key = Object.keys(DIFF_COLORS).find(k => d.toLowerCase().includes(k));
  return key ? DIFF_COLORS[key] : '#8A5CFF';
}

export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} hr`;
}

const DEFAULT_DURATION_MS = 3 * 60 * 1000;

/**
 * Returns a map of { [requestId]: estimatedPlayTimestamp } for each item in
 * queue (approved, sorted by queuePosition). The estimate accounts for
 * remaining time in the currently playing song (if any).
 */
export function estimateQueueTimes(playing, queue, now = Date.now()) {
  let cursor = now;
  const playingItem = playing[0];
  if (playingItem) {
    if (playingItem.playStartedAt) {
      const started = new Date(playingItem.playStartedAt).getTime();
      const duration = playingItem.duration_ms ?? DEFAULT_DURATION_MS;
      cursor += Math.max(0, started + duration - now);
    } else {
      cursor += playingItem.duration_ms ?? DEFAULT_DURATION_MS;
    }
  }
  const times = {};
  for (const item of queue) {
    times[item._id] = cursor;
    cursor += item.duration_ms ?? DEFAULT_DURATION_MS;
  }
  return times;
}
