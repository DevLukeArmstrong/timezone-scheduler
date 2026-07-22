import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    timezone?: string;
  }

  interface Session {
    user: {
      id: string;
      timezone: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    timezone?: string;
  }
}
