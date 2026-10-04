import { signOut } from 'next-auth/react';
import m from './mobile.module.css';
import { MenuItem } from './Sheet';

const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

/** Everything that isn't needed minute-to-minute on the dance floor. */
export default function MoreTab({ ctl, onOpenPage, onUseDesktop }) {
  return (
    <>
      <p className={m.sectionTitle}>During the event</p>
      <div className={m.menu}>
        <MenuItem icon="📣" label="Announcements" hint={ctl.announcements.activeMsg ? 'A message is showing now' : 'Message the room or one table'} onClick={() => onOpenPage('announce')} />
        <MenuItem icon="➕" label="Add to queue" hint="Add a dance or song yourself" onClick={() => onOpenPage('add')} />
        <MenuItem icon="🔔" label="Tips & notifications" count={ctl.unreadCount} onClick={() => onOpenPage('notifications')} />
        <MenuItem icon="📋" label="Played so far" hint="This session's history" onClick={() => onOpenPage('history')} />
      </div>

      <p className={m.sectionTitle}>Setup</p>
      <div className={m.menu}>
        <MenuItem icon="⚙️" label="Session settings" hint="Requests, partner dances, tipping, music source" onClick={() => onOpenPage('settings')} />
        <MenuItem icon="📺" label="Feed display" hint="Template and screen shape for the big screen" onClick={() => onOpenPage('feed')} />
        <MenuItem icon="🗂️" label="Sessions" hint="Past events, reports, continue a closed one" onClick={() => onOpenPage('sessions')} />
        {paymentsEnabled && <MenuItem icon="💳" label="Wallet" hint="Tips earned, payouts" onClick={() => onOpenPage('wallet')} />}
      </div>

      <p className={m.sectionTitle}>App</p>
      <div className={m.menu}>
        <MenuItem icon="🖥️" label="Use the desktop layout" hint="Better on a tablet or a wide screen" onClick={onUseDesktop} />
        <MenuItem icon="↩️" label="Sign out" onClick={() => signOut({ callbackUrl: '/' })} />
      </div>
    </>
  );
}
