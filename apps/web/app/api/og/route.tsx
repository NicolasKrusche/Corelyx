import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ?title=<title>&section=<section>&eyebrow=<eyebrow>
    const title = searchParams.get("title") ?? "Corelyx";
    const section = searchParams.get("section") ?? "";
    const eyebrow = searchParams.get("eyebrow") ?? "";

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0a0a0a",
            backgroundImage:
              "radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(147, 51, 234, 0.15) 0%, transparent 50%)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "space-between",
              width: "100%",
              height: "100%",
              padding: "80px 100px",
            }}
          >
            {/* Top: Logo + Section badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px",
                    fontWeight: "bold",
                    color: "white",
                  }}
                >
                  C
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "bold",
                    color: "white",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Corelyx
                </div>
              </div>
              {section && (
                <div
                  style={{
                    padding: "12px 24px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "rgba(255, 255, 255, 0.7)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {section}
                </div>
              )}
            </div>

            {/* Middle: Title */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                maxWidth: "900px",
              }}
            >
              {eyebrow && (
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: "600",
                    color: "#3b82f6",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                  }}
                >
                  {eyebrow}
                </div>
              )}
              <div
                style={{
                  fontSize: "72px",
                  fontWeight: "bold",
                  color: "white",
                  lineHeight: "1.1",
                  letterSpacing: "-0.03em",
                }}
              >
                {title}
              </div>
            </div>

            {/* Bottom: Tagline */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                fontSize: "24px",
                color: "rgba(255, 255, 255, 0.5)",
              }}
            >
              <div>EU-Native Compliance-First AI Workflow Automation</div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (e: any) {
    console.error(`Failed to generate OG image: ${e.message}`);
    return new Response(`Failed to generate image`, { status: 500 });
  }
}
