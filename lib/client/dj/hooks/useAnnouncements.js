import { useState } from 'react';
import useSWR from 'swr';

const fetcher = url => fetch(url).then(r => r.json());

/**
 * Session announcements: the active urgent message banner plus the
 * composer panel for posting new urgent/in-queue messages.
 */
export function useAnnouncements({ activeSession, mutateRequests }) {
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [msgTab, setMsgTab] = useState('urgent'); // 'urgent' | 'queue'
  const [msgText, setMsgText] = useState('');
  const [msgDuration, setMsgDuration] = useState(180);

  const { data: msgData, mutate: mutateMsg } = useSWR(
    activeSession ? `/api/dj/messages?sessionId=${activeSession._id}` : null,
    fetcher, { refreshInterval: 15000 }
  );
  const activeMsg = (() => {
    const m = msgData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  async function postMessage() {
    if (!msgText.trim()) return;
    await fetch('/api/dj/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msgText.trim(), duration: msgDuration }),
    });
    setMsgText('');
    mutateMsg();
  }

  async function clearMessage() {
    if (!activeMsg) return;
    await fetch(`/api/dj/messages/${activeMsg._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    mutateMsg();
  }

  async function addQueueMessage() {
    if (!msgText.trim() || !activeSession) return;
    await fetch('/api/dj/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceName: msgText.trim(),
        danceType: 'message',
        duration_ms: msgDuration ? msgDuration * 1000 : null,
        status: 'approved',
        sessionId: String(activeSession._id),
      }),
    });
    setMsgText('');
    setShowMessagePanel(false);
    mutateRequests();
  }

  return {
    activeMsg,
    showMessagePanel, setShowMessagePanel,
    msgTab, setMsgTab,
    msgText, setMsgText,
    msgDuration, setMsgDuration,
    postMessage, clearMessage, addQueueMessage,
  };
}
