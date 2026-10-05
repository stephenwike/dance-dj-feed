import { Heart, Flag, FileText, GraduationCap } from 'lucide-react';
import s from './DanceMarks.module.css';

/**
 * Icons in a row's top-right corner on the requester app:
 *   ♥ favorite and ⚑ wishlist — for a catalog line dance (`danceId`), the
 *     dancer's own, shared with Line Dance Manager;
 *   ♥ favorite song — for a partner dance whose song was picked from the
 *     music catalog (`trackId`); no wishlist or stepsheet for a song;
 *   📄 stepsheet — opens it in a new tab, for anyone.
 *
 * `marks` comes from useDanceMarks. Signed out, the hearts and flag still
 * show; tapping one calls `onNeedSignIn` instead of saving.
 */
export default function DanceMarks({ danceId, trackId, danceName, stepsheet, marks, isSignedIn, onNeedSignIn }) {
  if (!danceId && !trackId && !stepsheet) return null;

  function mark(kind, id) {
    return e => {
      e.stopPropagation();
      if (!isSignedIn) { onNeedSignIn(); return; }
      marks.toggle(kind, id, danceName);
    };
  }
  const isFavorite = isSignedIn && marks.has('favorite', danceId);
  const onWishlist = isSignedIn && marks.has('wishlist', danceId);
  const isFavoriteSong = isSignedIn && marks.has('song', trackId);

  return (
    <span className={s.marks}>
      {!danceId && trackId && (
        <button
          type="button"
          className={`${s.icon} ${isFavoriteSong ? s.favoriteOn : ''}`}
          onClick={mark('song', trackId)}
          aria-pressed={isFavoriteSong}
          aria-label={isFavoriteSong ? `Remove ${danceName} from your favorite songs` : `Add ${danceName} to your favorite songs`}
          title={isFavoriteSong ? 'In your favorite songs' : 'Favorite song'}
        >
          <Heart size={16} strokeWidth={2.2} fill={isFavoriteSong ? 'currentColor' : 'none'} />
        </button>
      )}
      {/* Keep a song's heart in the same column as line dances' hearts. */}
      {!danceId && trackId && <span className={s.slot} aria-hidden="true" />}
      {!danceId && trackId && !stepsheet && <span className={s.slot} aria-hidden="true" />}
      {danceId && (
        <>
          <button
            type="button"
            className={`${s.icon} ${isFavorite ? s.favoriteOn : ''}`}
            onClick={mark('favorite', danceId)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${danceName} from favorites` : `Add ${danceName} to favorites`}
            title={isFavorite ? 'In your favorites' : 'Favorite'}
          >
            <Heart size={16} strokeWidth={2.2} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`${s.icon} ${onWishlist ? s.wishlistOn : ''}`}
            onClick={mark('wishlist', danceId)}
            aria-pressed={onWishlist}
            aria-label={onWishlist ? `Remove ${danceName} from your wishlist` : `Add ${danceName} to your wishlist`}
            title={onWishlist ? 'On your wishlist' : 'Wishlist — dances you want to learn'}
          >
            <Flag size={16} strokeWidth={2.2} fill={onWishlist ? 'currentColor' : 'none'} />
          </button>
        </>
      )}
      {stepsheet && (
        <a
          className={s.icon}
          href={stepsheet}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          aria-label={`Stepsheet for ${danceName}`}
          title="Stepsheet"
        >
          <FileText size={16} strokeWidth={2.2} />
        </a>
      )}
    </span>
  );
}

/**
 * "Tush Push added to your favorites" — shown briefly after a heart or flag
 * is tapped (useDanceMarks sets `toast`). Floats over the page and lets taps
 * through.
 */
export function MarkToast({ toast }) {
  if (!toast) return null;
  const Icon = toast.kind === 'wishlist' ? Flag : toast.kind === 'learned' ? GraduationCap : Heart;
  const iconClass = toast.kind === 'wishlist' ? s.toastFlag : toast.kind === 'learned' ? s.toastLearned : s.toastHeart;
  return (
    <div key={toast.id} className={`${s.toast} ${toast.error ? s.toastError : ''}`} role="status" aria-live="polite">
      {!toast.error && (
        <Icon
          size={16}
          strokeWidth={2.4}
          fill={toast.on && toast.kind !== 'learned' ? 'currentColor' : 'none'}
          className={iconClass}
          aria-hidden="true"
        />
      )}
      <span className={s.toastText}>{toast.text}</span>
    </div>
  );
}

/** Asks a signed-out dancer to sign in, from the heart or flag. */
export function SignInToSave({ onSignIn, onClose }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.prompt} role="dialog" aria-labelledby="save-dances-title" onClick={e => e.stopPropagation()}>
        <div className={s.promptIcons} aria-hidden="true">
          <Heart size={22} fill="currentColor" className={s.promptHeart} />
          <Flag size={22} fill="currentColor" className={s.promptFlag} />
        </div>
        <h2 id="save-dances-title" className={s.promptTitle}>Save the dances you love</h2>
        <p className={s.promptText}>
          Sign in to keep your favorite dances and songs, and a wishlist of dances you want to learn.
          They’re saved to your DanceFeed account, so they’re there next time too.
        </p>
        <button type="button" className={s.promptSignIn} onClick={onSignIn}>Sign in</button>
        <button type="button" className={s.promptLater} onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}
