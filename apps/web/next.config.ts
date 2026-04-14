import nextra from "nextra";
import type { NextConfig } from "next";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@openfolio/hosted", "@openfolio/shared-types"],
};

export default withNextra(nextConfig);
