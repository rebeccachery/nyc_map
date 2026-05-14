import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow HMR when the browser uses 127.0.0.1 while the dev server was started as localhost (or vice versa).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
