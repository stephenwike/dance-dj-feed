import m from './mobile.module.css';

/** A bottom sheet: slides over the screen; tapping outside closes it. */
export default function Sheet({ title, subtitle, onClose, children }) {
  return (
    <div className={m.sheetBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={m.sheet} onClick={e => e.stopPropagation()}>
        <div className={m.sheetGrip} />
        {title && <h2 className={m.sheetTitle}>{title}</h2>}
        {subtitle && <p className={m.sheetSubtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** One row in a sheet or menu. */
export function MenuItem({ icon, label, hint, onClick, danger = false, disabled = false, count }) {
  return (
    <button
      className={`${m.menuItem} ${danger ? m.menuDanger : ''} ${disabled ? m.menuDisabled : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className={m.menuIcon}>{icon}</span>}
      <span className={m.menuText}>
        <span className={m.menuLabel}>{label}</span>
        {hint && <span className={m.menuHint}>{hint}</span>}
      </span>
      {count > 0 && <span className={m.menuCount}>{count}</span>}
    </button>
  );
}
