import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Share the root .env with Python. Next only bundles explicitly NEXT_PUBLIC_ values.
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.COOKED_ENV_FILE || path.join(root, "../.env") });

const backend = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const nextConfig = {
  poweredByHeader: false,
  // PDF reading can retry a slow provider; the default proxy deadline is only 30s.
  experimental: { proxyTimeout: 180_000 },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
