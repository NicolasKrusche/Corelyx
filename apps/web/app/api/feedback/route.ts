import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { sendFeedbackNotificationEmail } from "@/lib/email";

const CreateFeedbackSchema = z.object({
  type: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(1).max(4000),
  page_path: z.string().trim().max(500).optional(),
});

type FeedbackDb = any;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = CreateFeedbackSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  const { type, message, page_path } = parsed.data;
  const db = createServiceClient() as FeedbackDb;

  const { data: feedback, error } = await db
    .from("feedback")
    .insert({
      user_id: user.id,
      user_email: user.email ?? "",
      type,
      message,
      page_path: page_path ?? null,
    })
    .select("id")
    .single();

  if (error || !feedback) return apiError(error?.message ?? "Failed", 500);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const notifyEmail =
    process.env.FEEDBACK_NOTIFY_EMAIL ??
    (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean)[0];

  if (notifyEmail) {
    void sendFeedbackNotificationEmail({
      to: notifyEmail,
      type,
      message,
      userEmail: user.email ?? "(no email on record)",
      pagePath: page_path,
      adminUrl: `${appUrl}/admin/feedback`,
    }).catch(() => undefined);
  }

  return NextResponse.json({ feedback: { id: (feedback as { id: string }).id } }, { status: 201 });
}
