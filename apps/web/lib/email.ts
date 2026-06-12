/**
 * Email sending via Resend.
 * Requires RESEND_API_KEY and optionally FROM_EMAIL env vars.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = process.env.FROM_EMAIL ?? "Corelyx <noreply@corelyx.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.corelyx.app";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
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
    const msg = `[email] Resend error ${res.status}: ${body}`;
    console.error(msg);
    throw new Error(msg);
  }
}

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your Corelyx password",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;margin-bottom:16px;">
          <span style="font-size:24px;">🔑</span>
        </div>
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Reset your password</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">Click the button below to set a new password. This link expires in 1 hour.</p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${resetUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;letter-spacing:0.1px;">Reset password</a>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          If you didn&apos;t request a password reset, you can safely ignore this email.<br>
          Or copy this link: <a href="${resetUrl}" style="color:#ea580c;word-break:break-all;">${resetUrl}</a>
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx · <a href="${APP_URL}" style="color:#9ca3af;">${APP_URL}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}

export async function sendWelcomeEmail({ to }: { to: string }): Promise<void> {
  await sendEmail({
    to,
    subject: "Welcome to Corelyx",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Welcome to Corelyx 🎉</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">Your account is ready. Start building AI workflows in minutes.</p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${APP_URL}/dashboard" style="display:inline-block;background:#ea580c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;">Go to dashboard</a>
        </div>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx · <a href="${APP_URL}" style="color:#9ca3af;">${APP_URL}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}

export async function sendDuplicateSignupEmail({ to }: { to: string }): Promise<void> {
  const loginUrl = `${APP_URL}/login`;
  const resetUrl = `${APP_URL}/login?reset=1`;
  await sendEmail({
    to,
    subject: "Someone tried to create a Corelyx account with your email",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Account already exists</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">Someone (hopefully you) tried to sign up with this email address. You already have a Corelyx account — just sign in.</p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:16px;">
          <a href="${loginUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;">Sign in</a>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          Forgot your password? <a href="${resetUrl}" style="color:#ea580c;">Reset it here</a>.<br>
          If this wasn&apos;t you, no action is needed — your account is safe.
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx · <a href="${APP_URL}" style="color:#9ca3af;">${APP_URL}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}

// ─── Approval notification ─────────────────────────────────────────────────

export async function sendSecurityAlertEmail({
  to,
  subject,
  summary,
  items,
}: {
  to: string;
  subject: string;
  summary: string;
  items: Array<{ title: string; body: string }>;
}): Promise<void> {
  await sendEmail({
    to,
    subject,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx security alert</span></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(summary)}</p>
${items.map((item) => `
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin-bottom:12px;">
<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(item.title)}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;white-space:pre-wrap;">${escapeHtml(item.body)}</p>
</div>`).join("")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.trim(),
  });
}

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
              <span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span>
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

// ─── Agent notifications ───────────────────────────────────────────────────

export async function sendAgentQuestionEmail({
  to,
  agentName,
  agentId,
  question,
}: {
  to: string;
  agentName: string;
  agentId: string;
  question: string;
}): Promise<void> {
  const url = `${APP_URL}/agents/${agentId}`;
  await sendEmail({
    to,
    subject: `Your agent needs input: "${agentName}"`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Your agent has a question</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;"><strong>${escapeHtml(agentName)}</strong> paused and needs your input to continue.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">
<p style="margin:0;font-size:15px;color:#92400e;line-height:1.5;">${escapeHtml(question)}</p>
</td></tr></table>
<a href="${url}" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">Answer the agent</a>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">The agent run is paused until you reply.</p></td></tr>
</table></td></tr></table></body></html>`.trim(),
  });
}

export async function sendAgentReportEmail({
  to,
  agentName,
  agentId,
  reportTitle,
  summary,
}: {
  to: string;
  agentName: string;
  agentId: string;
  reportTitle: string;
  summary: string;
}): Promise<void> {
  const url = `${APP_URL}/agents/${agentId}`;
  await sendEmail({
    to,
    subject: `Agent finished: "${agentName}"`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">${escapeHtml(reportTitle)}</h1>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.5;"><strong>${escapeHtml(agentName)}</strong> finished its run.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(summary)}</p>
</td></tr></table>
<a href="${url}" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">View full report</a>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because your agent completed a run.</p></td></tr>
</table></td></tr></table></body></html>`.trim(),
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
              <span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span>
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
          <span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span>
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

// ─── Data subject request notifications ────────────────────────────────────

interface DsrEmailUserOptions {
  to: string;
  reference: string;
  typeLabel: string;
  submittedAt: string;
  dueAt: string;
  details?: string | null;
  autoFulfilled?: { summary: string; downloadUrl?: string } | null;
}

export async function sendDsrConfirmationEmail({
  to,
  reference,
  typeLabel,
  submittedAt,
  dueAt,
  details,
  autoFulfilled,
}: DsrEmailUserOptions): Promise<void> {
  const submittedFmt = new Date(submittedAt).toUTCString();
  const dueFmt = new Date(dueAt).toUTCString();
  const fulfilledBlock = autoFulfilled ? `
    <div style="border:1px solid #d1fae5;background:#ecfdf5;border-radius:6px;padding:16px;margin:0 0 24px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#065f46;">Auto-fulfilled</p>
      <p style="margin:0;font-size:13px;color:#047857;line-height:1.5;">${escapeHtml(autoFulfilled.summary)}</p>
      ${autoFulfilled.downloadUrl ? `<p style="margin:10px 0 0;"><a href="${autoFulfilled.downloadUrl}" style="color:#065f46;font-weight:600;">Download your data</a></p>` : ""}
    </div>` : "";
  const detailsBlock = details ? `
    <p style="margin:12px 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Your message</p>
    <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(details)}</p>` : "";

  await sendEmail({
    to,
    subject: `We received your data request — ${reference}`,
    html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">We received your request</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
We've recorded your data subject request and will respond within <strong>30 days</strong> as required by Article 12 GDPR. Keep this email as confirmation.
</p>
${fulfilledBlock}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Reference</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(reference)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Type</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Submitted</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(submittedFmt)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Response due by</p>
<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(dueFmt)}</p>
${detailsBlock}
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
Questions? Reply to this email or contact <a href="mailto:legal@corelyx.app" style="color:#111827;">legal@corelyx.app</a>.
</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx — ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
  });
}

interface DsrEmailLegalOptions {
  to: string;
  reference: string;
  typeLabel: string;
  requestType: string;
  userEmail: string;
  userId: string;
  submittedAt: string;
  dueAt: string;
  details?: string | null;
  autoFulfilled: boolean;
}

export async function sendDsrLegalNotificationEmail({
  to,
  reference,
  typeLabel,
  requestType,
  userEmail,
  userId,
  submittedAt,
  dueAt,
  details,
  autoFulfilled,
}: DsrEmailLegalOptions): Promise<void> {
  const submittedFmt = new Date(submittedAt).toUTCString();
  const dueFmt = new Date(dueAt).toUTCString();
  const detailsBlock = details ? `
    <p style="margin:12px 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Details</p>
    <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(details)}</p>` : "";
  const statusLine = autoFulfilled
    ? `<span style="display:inline-block;background:#d1fae5;color:#065f46;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;">Auto-fulfilled</span>`
    : `<span style="display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;">Manual review required</span>`;

  await sendEmail({
    to,
    subject: `[DSR ${autoFulfilled ? "auto" : "manual"}] ${typeLabel} — ${reference}`,
    html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx — DSR intake</span></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 12px;">${statusLine}</p>
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">New data subject request</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
You must respond within <strong>30 days</strong> per Article 12 GDPR. Reference: <strong>${escapeHtml(reference)}</strong>.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Type</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)} <span style="color:#9ca3af;">(${escapeHtml(requestType)})</span></p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">User</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(userEmail)}<br/><span style="font-family:monospace;color:#6b7280;font-size:12px;">${escapeHtml(userId)}</span></p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Submitted</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(submittedFmt)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Due by</p>
<p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(dueFmt)}</p>
${detailsBlock}
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Internal DSR notification — ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
  });
}

interface DsrResponseEmailOptions {
  to: string;
  reference: string;
  typeLabel: string;
  status: "completed" | "rejected" | "waiting_on_user";
  responseSummary: string;
}

export async function sendDsrResponseEmail({
  to,
  reference,
  typeLabel,
  status,
  responseSummary,
}: DsrResponseEmailOptions): Promise<void> {
  const headline =
    status === "completed"
      ? "Your data request is complete"
      : status === "rejected"
        ? "Your data request was reviewed"
        : "Action required on your data request";
  const intro =
    status === "completed"
      ? "We've completed the request you submitted. Details below."
      : status === "rejected"
        ? "After review, we are unable to action this request as submitted. Reasoning below."
        : "We need additional information from you before we can proceed.";
  const subject =
    status === "completed"
      ? `Resolved — ${typeLabel} (${reference})`
      : status === "rejected"
        ? `Update on your data request — ${reference}`
        : `Action needed — ${reference}`;

  await sendEmail({
    to,
    subject,
    html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">${escapeHtml(headline)}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">${escapeHtml(intro)}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Reference</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(reference)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Request</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Response</p>
<p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(responseSummary)}</p>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">If anything is unclear, reply to this email or contact <a href="mailto:legal@corelyx.app" style="color:#111827;">legal@corelyx.app</a>.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx — ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
  });
}

// ─── Password changed notification ────────────────────────────────────────

export async function sendPasswordChangedEmail({
  to,
  changedAt,
}: {
  to: string;
  changedAt: string;
}): Promise<void> {
  const settingsUrl = `${APP_URL}/settings`;
  const supportEmail = process.env.SUPPORT_EMAIL ?? "support@corelyx.app";

  await sendEmail({
    to,
    subject: "Your Corelyx password was changed",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;margin-bottom:16px;">
          <span style="font-size:24px;">🔒</span>
        </div>
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Password changed</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">
          Your Corelyx account password was successfully changed on ${escapeHtml(changedAt)}.
        </p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
            <strong>Wasn't you?</strong> If you didn't make this change, your account may be compromised.
            Contact us immediately at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#92400e;font-weight:600;">${escapeHtml(supportEmail)}</a> and
            <a href="${settingsUrl}" style="color:#92400e;font-weight:600;">change your password</a> right away.
          </p>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          If this was you, no further action is needed.
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx · <a href="${APP_URL}" style="color:#9ca3af;">${APP_URL}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}

// ─── DSR user follow-up notification ──────────────────────────────────────

interface DsrFollowUpNotificationOptions {
  to: string;
  reference: string;
  typeLabel: string;
  userEmail: string;
  followUp: string;
}

export async function sendDsrFollowUpNotificationEmail({
  to,
  reference,
  typeLabel,
  userEmail,
  followUp,
}: DsrFollowUpNotificationOptions): Promise<void> {
  await sendEmail({
    to,
    subject: `[DSR follow-up] User responded — ${reference}`,
    html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-size:18px;font-weight:600;color:#111827;">Corelyx — DSR follow-up</span></td></tr>
<tr><td style="padding:32px;">
<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;margin-bottom:16px;">User responded</span>
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">A user has responded to your request for more information.</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
  This DSR should be moved back to <strong>In review</strong>.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;margin-bottom:24px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Reference</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(reference)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Request type</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(typeLabel)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">User</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;">${escapeHtml(userEmail)}</p>
<p style="margin:0 0 6px;font-size:12px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Their message</p>
<p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(followUp)}</p>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx — DSR ${escapeHtml(reference)}</p></td></tr>
</table></td></tr></table>
</body></html>`.trim(),
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

export async function sendTwoFactorCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: `${code} is your Corelyx sign-in code`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;margin-bottom:16px;">
          <span style="font-size:24px;">&#128274;</span>
        </div>
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Your sign-in code</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">Enter this code to finish signing in. It expires in 10 minutes.</p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 28px;font-size:28px;font-weight:700;letter-spacing:8px;color:#111827;font-family:ui-monospace,Menlo,monospace;">${code}</span>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          If you didn&apos;t try to sign in, change your password immediately &mdash; someone may know it.<br>
          Corelyx will never ask you for this code by phone, chat, or email.
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx &middot; <a href="${APP_URL}" style="color:#9ca3af;">${APP_URL}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}
