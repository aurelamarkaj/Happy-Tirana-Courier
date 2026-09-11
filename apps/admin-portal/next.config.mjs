/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  transpilePackages: ["@happy-tirana/shared-types"]
};

export default nextConfig;
