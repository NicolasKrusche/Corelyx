import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { TWO_FACTOR_COOKIE, verifyCookieValue } from "@/lib/auth/two-factor";
import { VerifyTwoFactorClient } from "./verify-client";

export const metadata = { title: "Verify sign-in", robots: { index: false, follow: false } };

type TwoFactorProfile = { email_2fa_enabled: boolean | null };

export default async function VerifyTwoFactorPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single();

  const p = profile as TwoFactorProfile | null;
  const cookieStore = await cookies();
  const alreadyVerified = verifyCookieValue(cookieStore.get(TWO_FACTOR_COOKIE)?.value, user.id);
  if (!p?.email_2fa_enabled || alreadyVerified) redirect("/dashboard");

  return <VerifyTwoFactorClient email={user.email ?? ""} />;
}
