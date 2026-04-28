export type AvatarUploadResult = {
  publicUrl: string;
  fileName: string;
};

export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/profile/avatar", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | { publicUrl?: string; fileName?: string; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to upload image.");
  }

  if (!payload?.publicUrl || !payload.fileName) {
    throw new Error("Failed to upload image.");
  }

  return {
    publicUrl: payload.publicUrl,
    fileName: payload.fileName,
  };
}
