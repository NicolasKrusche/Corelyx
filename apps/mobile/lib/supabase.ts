import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Supabase session storage for React Native.
 *
 * SecureStore values are capped (~2KB) and Supabase sessions can exceed that, so
 * we keep the (larger) refresh/access session JSON in AsyncStorage but hold a
 * per-install marker in SecureStore. Access tokens are short-lived (1h) and
 * refresh rotation is on; the crlxmob_ device token (the durable credential) is
 * stored separately in SecureStore by lib/auth. This mirrors web's PKCE flow.
 */
const ExpoStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// NEVER throw at module scope: createClient("") throws "supabaseUrl is
// required.", and a throw during initial bundle evaluation closes a release
// app the instant it opens (this is exactly how the env-less v0.1.0 APK
// crashed). With missing config we construct a client against a placeholder
// host instead — requests fail loudly at call time and the login screen shows
// its isConfigured notice, but the app always reaches the UI.
export const supabase = createClient(
  SUPABASE_URL || "https://unconfigured.invalid",
  SUPABASE_ANON_KEY || "unconfigured",
  {
    auth: {
      storage: ExpoStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  }
);

// Small, sensitive values (the crlxmob_ device token) go in the OS keychain.
export const secureStore = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
