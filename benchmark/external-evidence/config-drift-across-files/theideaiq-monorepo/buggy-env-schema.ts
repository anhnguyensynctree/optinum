// Source: https://github.com/theideaiq/monorepo/pull/660 (and #690, #764, #778, #782)
// AI tool: Jules (Google Labs)
//
// Gap: Jules added SUPABASE_SERVICE_ROLE_KEY and ZAIN_SECRET_KEY to the Zod schema
// as required server vars but forgot to add them to apps/web/.env.example each time.
// New developers clone the repo, copy .env.example, and hit a Zod validation crash
// on startup. Jules had to file 4 separate fix PRs for the identical drift.
//
// File: packages/env/src/web.ts

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Pre-existing keys — present in .env.example
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),

    // Jules added these — present in schema, MISSING from .env.example
    // Each of the 4 PRs (#660, #690, #764, #778, #782) added keys here
    // without touching apps/web/.env.example
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    ZAIN_SECRET_KEY: z.string().min(1),
  },

  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ZAIN_SECRET_KEY: process.env.ZAIN_SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
