import type { Metadata } from "next";
import LandingPage from "./_landing/LandingPage";

const SITE_URL = "https://www.corelyx.app";
const DESCRIPTION =
  "Build AI agent workflows visually, inspect before running, and gate sensitive steps with human approval. GDPR-native automation built for EU-facing teams.";

export const metadata: Metadata = {
  title: "Corelyx — AI Automation Built for GDPR Compliance",
  description: DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Corelyx — AI Automation Built for GDPR Compliance",
    description: DESCRIPTION,
    url: SITE_URL,
  },
};

// JSON-LD: Organization + SoftwareApplication
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Corelyx",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/pictures/logo-no-bg.png`,
      },
      sameAs: [],
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@corelyx.app",
        contactType: "customer support",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Corelyx",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Corelyx",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        description: "Free plan available. Paid plans start at €9/month.",
      },
      publisher: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "Visual AI workflow editor",
        "GDPR-native architecture",
        "Human approval gates",
        "EU-hosted runtime",
        "60+ OAuth connectors",
        "Run-level audit logs",
        "Data Processing Agreement included",
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
