import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        // For now, we'll check if password exists in a separate field
        // In production, you'd store hashed passwords in the database
        // For this implementation, we'll need to add a password field to User model
        // or use a different approach
        
        // Check if user has a password (stored in accounts table for credentials provider)
        const account = await prisma.account.findFirst({
          where: {
            userId: user.id,
            provider: 'credentials',
          },
        });

        if (!account) {
          throw new Error('Invalid email or password');
        }

        // Compare password
        const isValid = await bcrypt.compare(
          credentials.password,
          account.access_token || '' // Using access_token field to store hashed password temporarily
        );

        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
        };
      },
    }),
    // Google and GitHub providers commented out for future use
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // }),
    // GitHubProvider({
    //   clientId: process.env.GITHUB_CLIENT_ID!,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tier = (user as any).tier;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).tier = token.tier;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getServerSession() {
  const { getServerSession } = await import('next-auth');
  return getServerSession(authOptions);
}
