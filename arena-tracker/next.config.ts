import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
