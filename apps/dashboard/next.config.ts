import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Explicitly declare NEXT_PUBLIC_* env vars so they get statically inlined into client
  // bundles regardless of bracket-notation access (process.env['X']) used in TS strict mode.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
