import type { NextConfig } from "next";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
