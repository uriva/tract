import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  async redirects() {
    return [
      {
        source: "/contract/:id",
        destination: "/app/contract/:id",
        permanent: true,
      },
      {
        source: "/contract/:id/compare/:pid",
        destination: "/app/contract/:id/compare/:pid",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
