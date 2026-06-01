/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Necesario para Docker / contenedores (reduce imagen de ~600MB a ~80MB)
  output: "standalone",
};

export default nextConfig;
