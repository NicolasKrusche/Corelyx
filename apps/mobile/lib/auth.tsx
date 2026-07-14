import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { api, ApiError, setDeviceToken, setUnauthorizedHandler } from "./api";
import { registerForPushToken } from "./push";
import { secureStore, supabase } from "./supabase";

const DEVICE_TOKEN_KEY = "corelyx.device_token";
// Stable identity for THIS install. Unlike the device token, it is NOT cleared on
// sign-out, so signing back in reuses the same server-side device row instead of
// registering a duplicate. Lives in the OS keychain.
const INSTALL_ID_KEY = "corelyx.install_id";

/** RFC-4122 v4 UUID. Uses Web Crypto when present (it is — Supabase PKCE needs
 *  it), falling back to Math.random so this never throws on an odd runtime. */
function randomUuid(): string {
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof g.crypto?.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The durable install id, minting and persisting one on first use. */
async function getInstallId(): Promise<string> {
  const existing = await secureStore.get(INSTALL_ID_KEY).catch(() => null);
  if (existing) return existing;
  const id = randomUuid();
  await secureStore.set(INSTALL_ID_KEY, id).catch(() => {});
  return id;
}

type AuthStatus = "loading" | "signed_out" | "signed_in";

interface AuthState {
  status: AuthStatus;
  email: string | null;
  /** True after signIn when the account requires an emailed 2FA code to finish. */
  pending2fa: boolean;
  /** In local dev (no email configured), the code the server returned so the app
   *  can pre-fill it. null in production. */
  devCode: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Complete registration with the emailed 6-digit code (when pending2fa). */
  submitTwoFactor: (code: string) => Promise<void>;
  /** Abandon a pending 2FA sign-in. */
  cancelPending: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshPushToken: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

function mobilePlatform(): "ios" | "android" {
  return Platform.OS === "android" ? "android" : "ios";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [pending2fa, setPending2fa] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const lastVerify = useRef(0);
  const pendingAccessToken = useRef<string | null>(null);
  const pendingEmail = useRef<string | null>(null);

  // Drop to login whenever the API reports the device token is dead (revoked via
  // "sign out everywhere"). This is the mobile analogue of web's SessionWatcher.
  //
  // A 401 alone is NOT proof the token is dead: a web route that only supports
  // cookie sessions also answers 401 to a device token. So before nuking the
  // session, confirm against /api/mobile/devices — a mobile-native endpoint that
  // authenticates the crlxmob_ token directly. 401 there ⇔ genuinely revoked.
  const verifyingRevocation = useRef(false);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (verifyingRevocation.current) return; // the probe's own 401 — ignore
      verifyingRevocation.current = true;
      void (async () => {
        try {
          await api.listDevices();
          // Token still valid — the 401 came from a route that doesn't accept
          // device auth (a server-side bug to fix, not a reason to sign out).
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) await hardSignOut();
        } finally {
          verifyingRevocation.current = false;
        }
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Restore a stored session on launch.
  useEffect(() => {
    (async () => {
      const token = await secureStore.get(DEVICE_TOKEN_KEY);
      if (!token) {
        setStatus("signed_out");
        return;
      }
      setDeviceToken(token);
      try {
        await api.sidebar(); // a cheap authenticated call doubles as a liveness check
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? null);
        setStatus("signed_in");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await hardSignOut();
        } else {
          setStatus("signed_in"); // network hiccup — keep the session
        }
      }
    })();
  }, []);

  // Re-verify on foreground so a remote revoke is caught within seconds.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || status !== "signed_in") return;
      const now = Date.now();
      if (now - lastVerify.current < 30_000) return;
      lastVerify.current = now;
      api.sidebar().catch((err) => {
        if (err instanceof ApiError && err.status === 401) void hardSignOut();
      });
    });
    return () => sub.remove();
  }, [status]);

  async function finalize(token: string) {
    await secureStore.set(DEVICE_TOKEN_KEY, token);
    setDeviceToken(token);
    setEmail(pendingEmail.current);
    setPending2fa(false);
    setDevCode(null);
    pendingAccessToken.current = null;
    setStatus("signed_in");
    // Acquire + upload the push token AFTER sign-in completes, so a slow or
    // unavailable push service never blocks getting into the app.
    void refreshPushToken();
  }

  async function hardSignOut() {
    setDeviceToken(null);
    pendingAccessToken.current = null;
    setPending2fa(false);
    await secureStore.remove(DEVICE_TOKEN_KEY).catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    setEmail(null);
    setStatus("signed_out");
  }

  async function signIn(emailInput: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? "Sign in failed.");
    }

    pendingAccessToken.current = data.session.access_token;
    pendingEmail.current = data.user?.email ?? emailInput.trim();

    // Register WITHOUT waiting on a push token (Expo Go / denied permission can
    // stall it). If the account has email 2FA, the server emails a code and asks
    // us to collect it before minting the device token. The install id lets the
    // server rotate this phone's existing device row instead of duplicating it.
    const reg = await api.registerDevice(data.session.access_token, {
      platform: mobilePlatform(),
      install_id: await getInstallId(),
    });

    if ("needs_2fa" in reg) {
      setDevCode(typeof reg.dev_code === "string" ? reg.dev_code : null);
      setPending2fa(true);
      return;
    }
    await finalize(reg.token);
  }

  async function submitTwoFactor(code: string) {
    if (!pendingAccessToken.current) throw new Error("Your sign-in expired. Please try again.");
    const reg = await api.registerDevice(pendingAccessToken.current, {
      platform: mobilePlatform(),
      two_factor_code: code.trim(),
      install_id: await getInstallId(),
    });
    if ("needs_2fa" in reg) throw new Error("That code was not accepted. Try again.");
    await finalize(reg.token);
  }

  async function cancelPending() {
    pendingAccessToken.current = null;
    setPending2fa(false);
    setDevCode(null);
    await supabase.auth.signOut().catch(() => {});
    setStatus("signed_out");
  }

  async function refreshPushToken() {
    const pushToken = await registerForPushToken().catch(() => null);
    if (pushToken) await api.uploadPushToken(pushToken).catch(() => {});
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        email,
        pending2fa,
        devCode,
        signIn,
        submitTwoFactor,
        cancelPending,
        signOut: hardSignOut,
        refreshPushToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
