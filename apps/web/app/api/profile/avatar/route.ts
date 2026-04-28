import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { ensureAvatarBucket } from "@/lib/avatar-storage";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function getSafeExtension(fileName: string) {
  const extension = (fileName.split(".").pop() ?? "png").toLowerCase();
  return /^[a-z0-9]+$/.test(extension) ? extension : "png";
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return apiError("No file provided.", 400);
  }
  if (!isImageFile(fileEntry)) {
    return apiError("Please choose an image file.", 400);
  }
  if (fileEntry.size > MAX_AVATAR_BYTES) {
    return apiError("Image too large. Use a file up to 2MB.", 400);
  }

  await ensureAvatarBucket();

  const supabaseService = createServiceClient();
  const extension = getSafeExtension(fileEntry.name);
  const objectPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const bytes = await fileEntry.arrayBuffer();

  const { error: uploadError } = await supabaseService.storage
    .from("avatars")
    .upload(objectPath, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: fileEntry.type,
    });

  if (uploadError) {
    return apiError(uploadError.message, 500);
  }

  const { data } = supabaseService.storage.from("avatars").getPublicUrl(objectPath);
  return NextResponse.json({
    publicUrl: data.publicUrl,
    fileName: fileEntry.name,
  });
}
