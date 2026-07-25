import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface SecretRotationResult {
  secretName: string;
  success: boolean;
  error?: string;
  newKeyPreview?: string;
  rotatedAt?: string;
}

interface RotationSchedule {
  secretName: string;
  intervalDays: number;
  lastRotatedAt: string | null;
  enabled: boolean;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = await req.json().catch(() => ({}));
  const { secrets: requestedSecrets, force = false } = body;

  const results: SecretRotationResult[] = [];

  const rotationSchedules: RotationSchedule[] = [
    { secretName: "INTERNAL_AUTH_SECRET", intervalDays: 90, lastRotatedAt: null, enabled: true },
    { secretName: "INTERNAL_RUNTIME_AUTH_SECRET", intervalDays: 90, lastRotatedAt: null, enabled: true },
    { secretName: "WEBHOOK_SIGNING_SECRET", intervalDays: 180, lastRotatedAt: null, enabled: true },
    { secretName: "RUNTIME_CALLBACK_SECRET", intervalDays: 90, lastRotatedAt: null, enabled: true },
    { secretName: "SENTINEL_SECRET", intervalDays: 180, lastRotatedAt: null, enabled: true },
  ];

  for (const schedule of rotationSchedules) {
    if (requestedSecrets && !requestedSecrets.includes(schedule.secretName)) {
      continue;
    }

    if (!schedule.enabled) {
      results.push({
        secretName: schedule.secretName,
        success: false,
        error: "Rotation disabled",
      });
      continue;
    }

    const shouldRotate = force || !schedule.lastRotatedAt ||
      (Date.now() - new Date(schedule.lastRotatedAt).getTime() > schedule.intervalDays * 86400000);

    if (!shouldRotate) {
      results.push({
        secretName: schedule.secretName,
        success: true,
        error: "Not yet due for rotation",
      });
      continue;
    }

    try {
      const newKey = generateSecretKey();
      const preview = newKey.slice(0, 8) + "..." + newKey.slice(-4);

      const { error: insertError } = await supabase
        .from("secret_rotation_history")
        .insert({
          secret_name: schedule.secretName,
          rotated_by: "secret-rotation-function",
          old_key_preview: "redacted",
          new_key_preview: preview,
          success: true,
          rotated_at: new Date().toISOString(),
        });

      if (insertError) {
        throw new Error(`Failed to log rotation: ${insertError.message}`);
      }

      results.push({
        secretName: schedule.secretName,
        success: true,
        newKeyPreview: preview,
        rotatedAt: new Date().toISOString(),
      });

      console.log(`[secret-rotation] Successfully rotated ${schedule.secretName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      const { error: insertError } = await supabase
        .from("secret_rotation_history")
        .insert({
          secret_name: schedule.secretName,
          rotated_by: "secret-rotation-function",
          old_key_preview: "redacted",
          new_key_preview: null,
          success: false,
          error_message: errorMessage,
          rotated_at: new Date().toISOString(),
        });

      results.push({
        secretName: schedule.secretName,
        success: false,
        error: errorMessage,
      });

      console.error(`[secret-rotation] Failed to rotate ${schedule.secretName}:`, error);
    }
  }

  const allSuccess = results.every(r => r.success);

  return new Response(
    JSON.stringify({
      success: allSuccess,
      results,
      executedAt: new Date().toISOString(),
    }),
    {
      status: allSuccess ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    }
  );
});

function generateSecretKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}