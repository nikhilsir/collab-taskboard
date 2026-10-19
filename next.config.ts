import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* custom production server (server.mjs) serves the app + socket.io */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
