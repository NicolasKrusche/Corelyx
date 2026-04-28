import { createServiceClient } from "@/lib/api";

const AVATAR_BUCKET_ID = "avatars";
const AVATAR_BUCKET_OPTIONS = {
  public: true,
  fileSizeLimit: 2 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
} as const;

let ensureAvatarBucketPromise: Promise<void> | null = null;

function isBucketAlreadyExistsError(message: string) {
  return message.toLowerCase().includes("already exists");
}

export function ensureAvatarBucket() {
  if (!ensureAvatarBucketPromise) {
    ensureAvatarBucketPromise = (async () => {
      const supabase = createServiceClient();
      const { error: getBucketError } = await supabase.storage.getBucket(AVATAR_BUCKET_ID);

      if (!getBucketError) {
        return;
      }

      const { error: createBucketError } = await supabase.storage.createBucket(
        AVATAR_BUCKET_ID,
        AVATAR_BUCKET_OPTIONS
      );

      if (createBucketError && !isBucketAlreadyExistsError(createBucketError.message)) {
        throw new Error(`Failed to ensure avatar bucket: ${createBucketError.message}`);
      }
    })().catch((error: unknown) => {
      ensureAvatarBucketPromise = null;
      throw error;
    });
  }

  return ensureAvatarBucketPromise;
}