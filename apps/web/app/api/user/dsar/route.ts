import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

const LEGAL_EMAIL = "legal@nexflow.app";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexflow.app";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Right of Access (Art. 15 GDPR)",
  correction: "Right to Rectification (Art. 16 GDPR)",
  erasure: "Right to Erasure / Right to be Forgotten (Art. 17 GDPR)",
  portability: "Right to Data Portability (Art. 20 GDPR)",
  objection: "Right to Object (Art. 21 GDPR)",
  restriction: "Right to Restriction of Processing (Art. 18 GDPR)",
  withdrawal: "Withdrawal of Consent (Art. 7(3) GDPR)",
};

const VALID_REQUEST_TYPES = new Set(Object.keys(REQUEST_TYPE_LABELS));

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: { request_type?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { request_type, description } = body;

  if (!request_type || !VALID_REQUEST_TYPES.has(request_type)) {
    return apiError(
      `Invalid request_type. Must be one of: ${[...VALID_REQUEST_TYPES].join(", ")}`,
      400,
    );
  }

  const typeLabel = REQUEST_TYPE_LABELS[request_type];
  const reference = `DSAR-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const submittedAt = new Date().toISOString();
  const userEmail = user.email ?? "(no email on record)";
  const descriptionHtml = description
    ? `<p style="margin:12px 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Additional details</p><p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(description)}</p>`
    : "";

  const apiKey = process.env.RESEND_API_KEY;
  const FROM = process.env.FROM_EMAIL ?? "Nexflow <noreply@nexflow.app>";

  if (apiKey) {
    // Notify legal team
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: LEGAL_EMAIL,
        subject: `DSAR request received — ${typeLabel} (${reference})`,
        html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Nexflow — DSAR intake</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">New DSAR request</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">A user has submitted a data subject access request. Under GDPR you must respond within <strong>30 days</strong>.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Reference</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(reference)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Request type</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">User</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(userEmail)} (ID: ${escapeHtml(user.id)})</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Submitted</p>
<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(submittedAt)}</p>
${descriptionHtml}
</td></tr></table>
<a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">Go to dashboard</a>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Internal DSAR notification — reference ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
      }),
      cache: "no-store",
    }).catch(() => {});

    // Confirmation to user
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: userEmail,
        subject: `We received your data request — ${reference}`,
        html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Nexflow</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">We received your request</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
  We've received your data subject request and will respond within <strong>30 days</strong> as required by GDPR. Keep this email as your confirmation.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Your reference</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(reference)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Request type</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Submitted</p>
<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(submittedAt)}</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
  If you have questions, reply to this email or contact us at <a href="mailto:legal@nexflow.app" style="color:#111827;">legal@nexflow.app</a>.
</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Nexflow — ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
      }),
      cache: "no-store",
    }).catch(() => {});
  }

  return NextResponse.json({ reference, submitted_at: submittedAt });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
