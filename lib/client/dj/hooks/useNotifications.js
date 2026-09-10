import useSWR from 'swr';

const fetcher = url => fetch(url).then(r => r.json());

export function useNotifications() {
  const { data, mutate } = useSWR('/api/dj/notifications', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  async function markRead(id) {
    await fetch('/api/dj/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutate();
  }

  async function markAllRead() {
    await fetch('/api/dj/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    mutate();
  }

  return { notifications, unreadCount, markRead, markAllRead, mutate };
}
