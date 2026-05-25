'use strict';
// Extracts just the pathname + search from returnUrl so Stripe always redirects
// back to our own origin, regardless of localhost vs 127.0.0.1 differences.
function safeReturnUrl(returnUrl) {
  try {
    const { pathname, search } = new URL(returnUrl);
    return `${process.env.NEXT_PUBLIC_BASE_URL}${pathname}${search}`;
  } catch {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
}

module.exports = { safeReturnUrl };
