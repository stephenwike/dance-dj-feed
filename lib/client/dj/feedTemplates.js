export const ASPECT_RATIOS = [
  { value: '16:9',  label: '16:9',  w: 1280, h: 720 },
  { value: '4:3',   label: '4:3',   w: 1024, h: 768 },
  { value: '21:9',  label: '21:9',  w: 2560, h: 1080 },
  { value: '9:16',  label: '9:16',  w: 720,  h: 1280 },
];

export const ELEMENT_TYPES = {
  'main-feed':      { label: 'Main Feed',      icon: '🖥️', desc: 'Full feed — QR code + now playing + queue', hasQr: true },
  'request-cta':    { label: 'Request CTA',    icon: '📱', desc: 'QR code + instructions to request', hasQr: true },
  'feed-panel':     { label: 'Feed Panel',     icon: '🎵', desc: 'Now playing + upcoming queue' },
  'now-playing':    { label: 'Now Playing',    icon: '▶',  desc: 'Current dance card only' },
  'queue-list':     { label: 'Queue',          icon: '📋', desc: 'Upcoming queue list only' },
  'message-banner': { label: 'Message Banner', icon: '💬', desc: 'DJ announcements banner' },
  'payment-links':  { label: 'Payment Links',  icon: '💰', desc: 'Tip the DJ QR codes' },
  'beats-ad':       { label: 'Beats Ad',       icon: '🪙', desc: 'Animated Beats promo — encourages sign-in and tipping' },
};

export const DEFAULT_TEMPLATE = {
  id: 'default',
  name: 'Default',
  isDefault: true,
  designedFor: '16:9',
  slides: [
    {
      id: 'default-main',
      name: 'Main',
      duration: 0,
      grid: { cols: 3, rows: 1 },
      elements: [
        { id: 'e1', type: 'request-cta', col: 1, row: 1, colSpan: 1, rowSpan: 1 },
        { id: 'e2', type: 'feed-panel',  col: 2, row: 1, colSpan: 2, rowSpan: 1 },
      ],
    },
  ],
};

export function hasQrCode(template) {
  if (!template?.slides) return false;
  return template.slides.some(slide =>
    slide.elements?.some(el => ELEMENT_TYPES[el.type]?.hasQr)
  );
}

export function templateWarnings(template, aspectRatio) {
  const warnings = [];
  if (!hasQrCode(template)) {
    warnings.push('No QR code element in any slide — attendees cannot request dances.');
  }
  if (template?.designedFor && aspectRatio && template.designedFor !== aspectRatio) {
    warnings.push(`Template designed for ${template.designedFor} — may not fit ${aspectRatio}.`);
  }
  return warnings;
}
