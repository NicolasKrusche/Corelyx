import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";

export type ProcessingRestriction = {
  restricted: boolean;
  restrictedAt: string | null;
  reason: string | null;
};

type DbClient = ReturnType<typeof createServiceClient>;

export async function getProcessingRestriction(
  userId: string,
  db: DbClient = createServiceClient()
): Promise<ProcessingRestriction> {
  const { data, error } = await db
    .from("profiles")
    .select("processing_restricted, processing_restricted_at, processing_restriction_reason")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Failed to load processing restriction state: ${error.message}`);
  }

  const row = data as {
    processing_restricted: boolean | null;
    processing_restricted_at: string | null;
    processing_restriction_reason: string | null;
  };

  return {
    restricted: row.processing_restricted === true,
    restrictedAt: row.processing_restricted_at,
    reason: row.processing_restriction_reason,
  };
}

export async function ensureProcessingAllowed(
  userId: string,
  db?: DbClient
): Promise<NextResponse | null> {
  const restriction = await getProcessingRestriction(userId, db);

  if (!restriction.restricted) return null;

  return NextResponse.json(
    {
      error: "PROCESSING_RESTRICTED",
      message: "Processing is restricted for this account while a GDPR restriction request is open.",
      restricted_at: restriction.restrictedAt,
    },
    { status: 423 }
  );
}
