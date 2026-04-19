/**
 * Email sending via Resend.
 * Requires RESEND_API_KEY and optionally FROM_EMAIL env vars.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = process.env.FROM_EMAIL ?? "Nexflow <noreply@nexflow.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexflow.app";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email] Resend error ${res.status}: ${body}`);
  }
}

// ─── Approval notification ─────────────────────────────────────────────────

interface ApprovalEmailOptions {
  to: string;
  nodeLabel: string;
  programName: string;
  approvalId: string;
  reason?: string;
}

export async function sendApprovalEmail({
  to,
  nodeLabel,
  programName,
  approvalId,
  reason,
}: ApprovalEmailOptions): Promise<void> {
  const approvalsUrl = `${APP_URL}/approvals`;

  await sendEmail({
    to,
    subject: `Action required: "${nodeLabel}" needs your approval`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:18px;font-weight:600;color:#111827;">Nexflow</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Approval required
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
                A step in your program is waiting for you to review and approve before it continues.
              </p>

              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Step</p>
                    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(nodeLabel)}</p>
                    <p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Program</p>
                    <p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(programName)}</p>
                    ${reason ? `
                    <p style="margin:12px 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Reason</p>
                    <p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(reason)}</p>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <a href="${approvalsUrl}"
                 style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">
                Review &amp; decide
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because a program you own requires human approval.
                <a href="${approvalsUrl}" style="color:#6b7280;">View all pending approvals</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

// ─── Run failure notification ──────────────────────────────────────────────

interface RunFailureEmailOptions {
  to: string;
  programName: string;
  runId: string;
  programId: string;
  errorMessage?: string;
  triggeredBy?: string;
}

export async function sendRunFailureEmail({
  to,
  programName,
  runId,
  programId,
  errorMessage,
  triggeredBy,
}: RunFailureEmailOptions): Promise<void> {
  const runUrl = `${APP_URL}/programs/${programId}/runs/${runId}`;

  await sendEmail({
    to,
    subject: `Run failed: "${programName}"`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:18px;font-weight:600;color:#111827;">Nexflow</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <table width="24" cellpadding="0" cellspacing="0" style="display:inline-table;margin-bottom:16px;">
                <tr>
                  <td style="background:#fee2e2;border-radius:50%;width:40px;height:40px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;">✕</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Run failed
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
                A run of <strong>${escapeHtml(programName)}</strong> failed${triggeredBy ? ` (triggered by ${escapeHtml(triggeredBy)})` : ""}.
              </p>

              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Program</p>
                    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(programName)}</p>
                    ${errorMessage ? `
                    <p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Error</p>
                    <p style="margin:0;font-size:13px;color:#dc2626;font-family:monospace;word-break:break-all;">${escapeHtml(errorMessage)}</p>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <a href="${runUrl}"
                 style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">
                View run logs
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because a program you own failed to complete.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

// ─── Run limit warning ─────────────────────────────────────────────────────

interface RunLimitWarningOptions {
  to: string;
  used: number;
  total: number;
  tier: string;
}

export async function sendRunLimitWarningEmail({
  to,
  used,
  total,
  tier,
}: RunLimitWarningOptions): Promise<void> {
  const planUrl = `${APP_URL}/plan`;
  const pct = Math.round((used / total) * 100);

  await sendEmail({
    to,
    subject: `You've used ${pct}% of your monthly runs`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:18px;font-weight:600;color:#111827;">Nexflow</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Running low on runs</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
            You've used <strong>${used} of ${total} runs</strong> this month on the <strong>${escapeHtml(tier)}</strong> plan.
            Once you hit the limit, new runs will be queued until your monthly reset.
          </p>
          <!-- Progress bar -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background:#f3f4f6;border-radius:999px;height:8px;overflow:hidden;">
              <td style="background:#f97316;border-radius:999px;height:8px;width:${pct}%;"></td>
            </td></tr>
          </table>
          <a href="${planUrl}" style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">
            View plans
          </a>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're approaching your monthly run limit.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
