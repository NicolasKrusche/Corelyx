// API routes that authenticate through getAuthUser() (cookie session) but must
// stay reachable for a session that has NOT yet satisfied email 2FA. Enforcing
// the 2FA gate on these would dead-lock the login flow: the user could never
// obtain a valid 2FA cookie because the route the flow depends on would itself
// be blocked.
//
// Deliberately tiny. Most of the login / 2FA-enrollment / consent / onboarding
// routes authenticate via supabase.auth.getUser() DIRECTLY (not getAuthUser),
// so they never pass through the 2FA gate and need no entry here:
//   - /api/auth/two-factor/challenge   (getUser)
//   - /api/auth/two-factor/verify      (getUser — issues the 2FA cookie)
//   - /api/settings/two-factor         (getUser)
//   - /api/settings/consent            (getUser)
//   - /api/onboarding                  (getUser)
//
// Only /api/auth/post-login uses getAuthUser AND runs before 2FA (right after
// sign-in, to provision the account), so it is the single explicit exemption.
export function isTwoFactorExemptApiPath(pathname: string): boolean {
  return pathname === "/api/auth/post-login";
}
