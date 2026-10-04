import styles from '../../pages/dj-controller/dj-controller.module.css';
import PendingDanceGroup from './PendingDanceGroup';
import PendingRequesterGroup from './PendingRequesterGroup';

/**
 * Pending requests, by dance or by requester, with the Line/Partner filter
 * and sort. Used by both layouts; all state comes from useController.
 *
 * `bare` — leave out the panel frame (the phone layout supplies its own).
 */
export default function PendingRequests({ ctl, bare = false }) {
  const {
    pendingTab, setPendingTab, danceGroups, filteredDanceGroups, requesterGroups,
    showFilter, activeFilter, setPendingFilter, pendingSort, setPendingSort,
  } = ctl;

  const tabs = (
    <div className={styles.segControl}>
      <button
        className={`${styles.seg} ${pendingTab === 'dances' ? styles.segActive : ''}`}
        onClick={() => setPendingTab('dances')}
      >
        By Dance {danceGroups.length > 0 && <span className={styles.segBadge}>{danceGroups.length}</span>}
      </button>
      <button
        className={`${styles.seg} ${pendingTab === 'requesters' ? styles.segActive : ''}`}
        onClick={() => setPendingTab('requesters')}
      >
        By Requester
      </button>
    </div>
  );

  const list = (
    <>
      {pendingTab === 'dances' && danceGroups.length > 0 && (
        <div className={styles.pendingControls}>
          {showFilter && (
            <div className={styles.filterGroup}>
              <span className={styles.controlLabel}>Filter</span>
              <div className={styles.filterChips}>
                {['all', 'line', 'partner'].map(f => (
                  <button
                    key={f}
                    className={`${styles.filterChip} ${activeFilter === f ? styles.filterChipActive : ''}`}
                    onClick={() => setPendingFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'line' ? 'Line' : 'Partner'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={styles.sortGroup}>
            <span className={styles.controlLabel}>Sort</span>
            <button
              className={`${styles.sortBtn} ${pendingSort === 'alpha' ? styles.sortBtnActive : ''}`}
              onClick={() => setPendingSort(s => (s === 'score' ? 'alpha' : 'score'))}
            >
              {pendingSort === 'alpha' ? 'A–Z' : 'Score'}
            </button>
          </div>
        </div>
      )}
      {pendingTab === 'dances' && (
        filteredDanceGroups.length === 0
          ? <p className={styles.empty}>{danceGroups.length === 0 ? 'No pending requests yet.' : 'No requests match this filter.'}</p>
          : filteredDanceGroups.map(group => (
              <PendingDanceGroup
                key={group.key}
                group={group}
                playsPerClient={ctl.playsPerClient}
                resolvedNames={ctl.resolvedNames}
                onAction={ctl.handleAction}
                onEdit={ctl.setEditingGroup}
              />
            ))
      )}
      {pendingTab === 'requesters' && (
        requesterGroups.length === 0
          ? <p className={styles.empty}>No requests yet.</p>
          : requesterGroups.map(group => (
              <PendingRequesterGroup
                key={group.key}
                group={group}
                playsPerClient={ctl.playsPerClient}
                suppressedSet={ctl.suppressedSet}
                onToggleSuppress={ctl.toggleSuppress}
              />
            ))
      )}
    </>
  );

  if (bare) return <>{tabs}{list}</>;
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>{tabs}</div>
      <div className={styles.panelBody}>{list}</div>
    </div>
  );
}
