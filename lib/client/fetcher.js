// SWR fetcher. Throws on non-2xx so SWR keeps the last good data and exposes
// the failure as `error`, instead of handing an `{ error }` body to code that
// expects (for example) an array of requests.
export async function fetcher(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
