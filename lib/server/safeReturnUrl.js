'use strict';
/**
 * Where Stripe (or another off-site step) should send the browser back to.
 *
 * It must be our own site — never an address taken blindly from the request
 * body. Prefer the exact address the DJ is browsing on: the browser only
 * sends its sign-in cookie to the host it was set for, so returning to
 * 127.0.0.1 when they were on localhost (or to example.com when they were on
 * www.example.com) lands them on a sign-in page. So:
 *   - `returnUrl` on the same host this request was made to → keep it
 *     (that host is where the DJ is, and it is us);
 *   - otherwise → the same path on NEXT_PUBLIC_BASE_URL.
 */
function requestHost(req) {
  if (!req?.headers) return null;
  const forwarded = req.headers['x-forwarded-host'];
  return String((forwarded && forwarded.split(',')[0]) || req.headers.host || '').trim().toLowerCase() || null;
}

function safeReturnUrl(returnUrl, req) {
  try {
    const url = new URL(returnUrl);
    const path = `${url.pathname}${url.search}`;
    const host = requestHost(req);
    if (host && url.host.toLowerCase() === host && /^https?:$/.test(url.protocol)) {
      return `${url.protocol}//${url.host}${path}`;
    }
    return `${process.env.NEXT_PUBLIC_BASE_URL}${path}`;
  } catch {
    // A bare path ("/dj-controller") goes to that path on the configured site.
    const isPath = typeof returnUrl === 'string' && returnUrl.startsWith('/') && !returnUrl.startsWith('//');
    return `${process.env.NEXT_PUBLIC_BASE_URL}${isPath ? returnUrl : ''}`;
  }
}

module.exports = { safeReturnUrl, requestHost };
