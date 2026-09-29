import { useState } from 'react';
import s from './LocalFiles.module.css';
import LibrarySearch from './LibrarySearch';

/** QUEUE_FOOTER slot: search the music folder and queue a track. */
export default function LocalFilesQueueFooter({ runtime, controller }) {
  const [open, setOpen] = useState(false);
  const canAdd = runtime.library.status === 'ready' && !!controller.session;

  if (!open) {
    return (
      <button
        className={s.searchToggle}
        onClick={() => setOpen(true)}
        disabled={!canAdd}
        title={canAdd ? undefined : 'Start the session and connect your music folder first'}
      >
        + Add from music folder
      </button>
    );
  }
  return (
    <LibrarySearch
      search={runtime.search}
      onClose={() => setOpen(false)}
      onPick={async entry => { setOpen(false); await runtime.addToQueue(entry, controller.nextQueuePos); }}
    />
  );
}
