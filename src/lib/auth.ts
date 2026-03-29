import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/encryption";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) {
          return null;
        }

        // Get the single user config
        const config = await db.select().from(appConfig).limit(1);

        if (config.length === 0) {
          // No password set yet - initial setup
          return { id: "setup" };
        }

        const isValid = await verifyPassword(
          credentials.password as string,
          config[0].passwordHash
        );

        if (!isValid) {
          return null;
        }

        // Update last login
        await db
          .update(appConfig)
          .set({ lastLogin: new Date() })
          .where(eq(appConfig.id, config[0].id));

        return { id: config[0].id };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
});