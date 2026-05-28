import type { Metadata } from "next";
import LandingPage from "./_landing/LandingPage";

const SITE_URL = "https://www.corelyx.app";
const DESCRIPTION =
  "Corelyx is an EU-native compliance-first AI workflow automation platform for GDPR AI automation, EU AI Act workflows, secure AI agents, and human oversight.";

export const metadata: Metadata = {
  title: "Corelyx - EU-Native Compliance-First AI Workflow Automation",
  description: DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Corelyx - EU-Native Compliance-First AI Workflow Automation",
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
      knowsAbout: [
        "GDPR AI automation",
        "EU AI Act workflows",
        "AI governance",
        "secure AI workflows",
        "human-in-the-loop automation",
        "AI auditability",
        "European AI infrastructure",
      ],
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
        "EU-native automation infrastructure",
        "GDPR AI automation controls",
        "EU AI Act workflow review",
        "AI governance workflow evidence",
        "Human approval gates",
        "EU-only mode for eligible workflows",
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
