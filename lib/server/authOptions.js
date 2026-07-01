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
