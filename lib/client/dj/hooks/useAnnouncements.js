import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '../../fetcher';

export function useAnnouncements({ session, mutateRequests }) {
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [msgTab, setMsgTab] = useState('urgent'); // 'urgent' | 'queue' | 'direct'
  const [msgText, setMsgText] = useState('');
  const [msgDuration, setMsgDuration] = useState(180);
  const [sendToAll, setSendToAll] = useState(false);

  const { data: msgData, mutate: mutateMsg } = useSWR(
    session ? `/api/dj/messages?sessionId=${session._id}` : null,
    fetcher, { refreshInterval: 15000 }
  );
  const activeMsg = (() => {
    const m = msgData?.message;
    if (!m) return null;
    if (m.expiresAt && new Date(m.expiresAt) <= new Date()) return null;
    return m;
  })();

  async function postMessage() {
    if (!msgText.trim() || !session) return;
    await fetch('/api/dj/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msgText.trim(), duration: msgDuration, sendToAll, sessionId: String(session._id) }),
    });
    setMsgText('');
    setSendToAll(false);
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
    if (!msgText.trim() || !session) return;
    await fetch('/api/dj/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        danceName: msgText.trim(),
        danceType: 'message',
        duration_ms: msgDuration ? msgDuration * 1000 : null,
        status: 'approved',
        sessionId: String(session._id),
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
    sendToAll, setSendToAll,
    postMessage, clearMessage, addQueueMessage,
  };
}
