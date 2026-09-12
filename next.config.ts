import type { NextConfig } from "next";

const isPagesBuild = process.env.TAGTEAM_PAGES_BUILD === "true";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "export",
  trailingSlash: true,
  basePath: isPagesBuild ? "/TagTeamGPT" : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
