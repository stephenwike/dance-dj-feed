import s from './session.module.css';
import { MUSIC_SOURCES } from '../../lib/dj/musicSources';
import { addOnFor } from '../../lib/dj/sessionAddOns';
import { PAYMENTS_ENABLED } from '../../lib/client/dj/useGoLive';
import { formatCents } from './ChargeSummary';

/**
 * Choose the session's music source. Included sources say so; paid ones show
 * their flat add-on price; coming-soon ones are shown but disabled. The choice
 * can be changed later in the controller (back to an included source at any
 * time, or by buying an add-on).
 */
export default function MusicSourcePicker({ value, onChange }) {
  return (
    <div className={s.sources} role="radiogroup" aria-label="Music source">
      {MUSIC_SOURCES.map(src => {
        const addOn = addOnFor(src.id);
        const selected = value === src.id;
        return (
          <button
            key={src.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={src.comingSoon}
            className={`${s.source} ${selected ? s.sourceSelected : ''} ${src.comingSoon ? s.sourceSoon : ''}`}
            onClick={() => onChange(src.id)}
          >
            <span className={s.sourceTop}>
              <span className={s.sourceName}>{src.label}</span>
              <span className={s.sourceBadges}>
                {src.comingSoon && <span className={s.sourceComingSoon}>Coming soon</span>}
                <span className={addOn ? s.sourcePrice : s.sourceIncluded}>
                  {addOn ? (PAYMENTS_ENABLED ? `+${formatCents(addOn.priceCents)}` : 'Add-on') : 'Included'}
                </span>
              </span>
            </span>
            <span className={s.sourceDesc}>{src.description}</span>
          </button>
        );
      })}
    </div>
  );
}
