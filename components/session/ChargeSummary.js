import s from './session.module.css';

export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The lines of a launch charge (lib/dj/sessionAddOns.js#launchCharge) and its total. */
export default function ChargeSummary({ charge }) {
  if (!charge) return null;
  return (
    <div className={s.summary}>
      {charge.items.map(item => (
        <div key={item.label} className={s.summaryLine}>
          <span>{item.label}</span>
          <span>{formatCents(item.priceCents)}</span>
        </div>
      ))}
      <div className={`${s.summaryLine} ${s.summaryTotal}`}>
        <span>Total</span>
        <span>{formatCents(charge.priceCents)}</span>
      </div>
    </div>
  );
}
