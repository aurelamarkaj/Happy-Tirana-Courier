/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  devIndicators: { position: "top-right" },
  transpilePackages: ["@happy-tirana/shared-types"]
};

export default nextConfig;
