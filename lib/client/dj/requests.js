export async function patch(id, body) {
  await fetch(`/api/dj/requests/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function del(id) {
  await fetch(`/api/dj/requests/${id}`, { method: 'DELETE' });
}
