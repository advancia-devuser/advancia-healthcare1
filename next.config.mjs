import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Required for Docker deployments
  turbopack: {
    // Prevent Next from inferring the wrong workspace root when other lockfiles exist.
    root: __dirname,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Some wallet SDKs expect the React Native AsyncStorage module even in web builds.
      // Provide a tiny web-safe shim to avoid build warnings and runtime crashes.
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "lib/shims/async-storage.ts"
      ),
    };
    return config;
  },
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

  // ── Security Headers ──
  // Applied on every response when deployed to Vercel (or any Node server).
  // Mirrors the headers already set in infra/nginx.conf for Docker deploys.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.alchemyapi.io",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://static.alchemyapi.io",
              "font-src 'self'",
              "connect-src 'self' https://*.alchemyapi.io https://*.alchemy.com https://api.resend.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
