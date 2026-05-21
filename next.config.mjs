/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint warnings don't block production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
