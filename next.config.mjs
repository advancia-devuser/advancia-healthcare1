/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Required for Docker deployments
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.alchemyapi.io",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
