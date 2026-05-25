import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher([
  '/',
  '/dj-feed',
  '/dj-request',
  '/feed/(.*)',
  '/request/(.*)',
  '/api/dj/dances',
  '/api/dj/messages',       // GET — feed polling, public
  '/api/dj/requests',       // GET (feed) + POST (attendee submissions)
  '/api/dj/requests/(.*)',  // PATCH from feed auto-advance (unauthenticated TV display)
  '/api/beats/webhook',     // Stripe — no user auth, verified by signature
  '/api/tips/direct',       // anyone can tip the DJ, no account required
]);

export default clerkMiddleware((auth, request) => {
  if (!isPublic(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
