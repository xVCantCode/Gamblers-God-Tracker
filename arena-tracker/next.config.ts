import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // Disable image optimization to prevent 402 errors on Vercel
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ddragon.leagueoflegends.com",
      },
      // Allow CommunityDragon raw assets (augment icons)
      {
        protocol: "https",
        hostname: "raw.communitydragon.org",
      },
    ],
  },
};

export default nextConfig;
