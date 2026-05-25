import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { NextResponse } from "next/server";

type AnyDb = { from(table: string): any };

/** DELETE /api/user/tokens/[id] — revoke a personal API token */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;

  const service = createServiceClient() as unknown as AnyDb;

  // Scoped to user_id — prevents revoking another user's token
  const { error } = await service
    .from("personal_api_tokens")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return apiError((error as { message: string }).message, 500);
  return NextResponse.json({ ok: true });
}
