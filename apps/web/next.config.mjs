import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  transpilePackages: ["@flowos/schema", "@flowos/db"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@xyflow/react",
      "framer-motion",
      "@tsparticles/react",
      "@tsparticles/slim",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // Legal nav and external links use /data-residency; keep the short
      // form working for bookmarks and older emails.
      {
        source: "/residency",
        destination: "/data-residency",
        permanent: true,
      },
      // Admin pages have terse canonical paths; redirect the intuitive guesses
      // instead of returning a 404.
      {
        source: "/admin/feature-flags",
        destination: "/admin/flags",
        permanent: true,
      },
      {
        source: "/admin/tickets",
        destination: "/admin/support",
        permanent: true,
      },
      {
        source: "/admin/circuit-breakers",
        destination: "/admin/circuits",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
