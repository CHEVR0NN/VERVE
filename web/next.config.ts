import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repo root also has a package-lock.json (for the unrelated `serve public`
  // static site) — pin the workspace root so Next doesn't try to infer it.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
