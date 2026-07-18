import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getAuthUser } from "@/lib/api";
import { isAdmin } from "@/lib/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

// The known Corelyx sending identities — all on the corelyx.app domain, which
// is the one verified in Resend. Keep in sync with addresses referenced
// elsewhere (lib/email.ts FROM default, lib/legal.ts LEGAL_EMAIL).
export const KNOWN_SENDERS = [
  "noreply@corelyx.app",
  "support@corelyx.app",
  "legal@corelyx.app",
] as const;

const emailList = z
  .string()
  .trim()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .refine((list) => list.every((e) => z.string().email().safeParse(e).success), {
    message: "Contains an invalid email address",
  });

const ComposeSchema = z.object({
  from: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]+@corelyx\.app$/, "From must be a corelyx.app address"),
  to: emailList.refine((list) => list.length > 0, "At least one recipient is required"),
  cc: emailList.optional(),
  bcc: emailList.optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: apiError("Unauthorized", 401) };
  if (!(await isAdmin(user.id, user.email ?? undefined))) return { error: apiError("Forbidden", 403) };
  return { user };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ senders: KNOWN_SENDERS });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = ComposeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { from, to, cc, bcc, subject, body } = parsed.data;

  try {
    await sendEmail({
      from: `Corelyx <${from}>`,
      to,
      cc,
      bcc,
      subject,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.6;">${escapeHtml(body)}</div>`,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to send email", 502);
  }

  return NextResponse.json({ sent: true });
}
