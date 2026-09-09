const { MongoClient } = require('mongodb');
const DB_NAME = process.env.MONGODB_DB || 'djfeed';

async function upsertUserProfile(user) {
  try {
    // Reuse the shared client promise set up by lib/server/mongodb.js when available
    const promise = global._mongoClientPromise ?? (() => {
      const c = new MongoClient(process.env.MONGODB_URI);
      return (global._mongoClientPromise = c.connect());
    })();
    const client = await promise;
    await client.db(DB_NAME).collection('user_profiles').updateOne(
      { id: user.id },
      { $set: { id: user.id, email: user.email, name: user.name, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error('user_profiles upsert failed:', err.message);
  }
}

const LDCO_AUTH_URL = process.env.LDCO_AUTH_URL || 'http://localhost:3001';

const authOptions = {
  providers: [
    {
      id: 'ldco',
      name: 'DanceFeed',
      type: 'oauth',
      authorization: {
        url: `${LDCO_AUTH_URL}/api/oauth/authorize`,
        params: { scope: 'openid profile email' },
      },
      token: `${LDCO_AUTH_URL}/api/oauth/token`,
      userinfo: `${LDCO_AUTH_URL}/api/oauth/userinfo`,
      clientId: process.env.LDCO_OAUTH_CLIENT_ID,
      clientSecret: process.env.LDCO_OAUTH_CLIENT_SECRET,
      checks: ['state'],
      idToken: false,
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
        };
      },
    },
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      // Upsert on first use of any session — catches existing users whose tokens
      // predate this change, since their JWTs won't carry profileSynced yet.
      if (token.id && !token.profileSynced) {
        token.profileSynced = true;
        upsertUserProfile({ id: token.id, email: token.email, name: token.name });
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: token.id,
          email: token.email,
          name: token.name,
        };
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

module.exports = { authOptions };
