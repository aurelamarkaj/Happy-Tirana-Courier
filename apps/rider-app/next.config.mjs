/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { position: "top-right" },
  transpilePackages: ["@happy-tirana/shared-types"]
};

export default nextConfig;
