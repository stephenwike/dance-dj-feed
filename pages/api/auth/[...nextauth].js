import NextAuth from 'next-auth';
import { authOptions } from '../../../lib/server/authOptions';

export default NextAuth(authOptions);
