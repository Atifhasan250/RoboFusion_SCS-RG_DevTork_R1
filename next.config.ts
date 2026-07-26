import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The command dashboard uses React Router for its client-side views. These
   * rewrites make direct links and browser refreshes resolve to the Next.js
   * application shell instead of returning a 404 from the server.
   */
  async rewrites() {
    return [
      { source: "/login", destination: "/" },
      { source: "/priority", destination: "/" },
      { source: "/zones/:path*", destination: "/" },
      { source: "/incidents/:path*", destination: "/" },
      { source: "/reports", destination: "/" },
      { source: "/system-health", destination: "/" },
    ];
  },
};

export default nextConfig;
