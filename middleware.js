import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

const publicPaths = [
  '/',
  '/dj-feed',
  '/dj-request',
];

const publicPatterns = [
  /^\/feed\/.+/,
  /^\/request\/.+/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/dj\/dances$/,
  /^\/api\/dj\/messages/,
  /^\/api\/dj\/requests/,
  /^\/api\/beats\/webhook$/,
  /^\/api\/tips\/direct$/,
];

function isPublic(pathname) {
  if (publicPaths.includes(pathname)) return true;
  return publicPatterns.some(p => p.test(pathname));
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL('/api/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
