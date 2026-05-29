import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

const MAX_BYTES = 5 * 1024 * 1024;

function getSafeExtension(fileName: string) {
  const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase();
  return /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Forbidden", 403);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return apiError("No file provided.", 400);
  if (!file.type.startsWith("image/")) return apiError("Please choose an image file.", 400);
  if (file.size > MAX_BYTES) return apiError("Image too large. Max 5 MB.", 400);

  const service = createServiceClient();
  const ext = getSafeExtension(file.name);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await service.storage
    .from("post-images")
    .upload(path, bytes, { cacheControl: "31536000", upsert: false, contentType: file.type });

  if (uploadError) return apiError(uploadError.message, 500);

  const { data } = service.storage.from("post-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
