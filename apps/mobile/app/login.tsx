import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { Button, Screen } from "@/components/ui";
import { Logo } from "@/components/brand";
import { colors, font, radius, spacing } from "@/lib/theme";
import { isConfigured } from "@/lib/config";

export default function Login() {
  const { signIn, submitTwoFactor, cancelPending, pending2fa, devCode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // In local dev the server returns the code so it can be used without email.
  const displayedCode = code || devCode || "";

  async function onSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setError(null);
    setBusy(true);
    try {
      await submitTwoFactor(displayedCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", padding: spacing.xl }}
      >
        <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
          <Logo size={46} />
        </View>
        <Text style={[font.muted, { textAlign: "center", marginBottom: spacing.xl }]}>
          Manage your workflows, agents, and account
        </Text>

        {!isConfigured ? (
          <Text style={[font.tiny, { color: colors.warn, textAlign: "center", marginBottom: spacing.md }]}>
            Supabase env not configured (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY).
          </Text>
        ) : null}

        {pending2fa ? (
          <>
            <Text style={[font.title, { textAlign: "center", marginBottom: spacing.xs }]}>
              Enter your 2FA code
            </Text>
            <Text style={[font.muted, { textAlign: "center", marginBottom: spacing.lg }]}>
              {devCode
                ? "Dev mode: your code is filled in below — just tap Verify."
                : "We emailed a 6-digit code to verify this phone."}
            </Text>
            <TextInput
              style={[styles.input, { textAlign: "center", letterSpacing: 8, fontSize: 22 }]}
              placeholder="000000"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={6}
              value={displayedCode}
              onChangeText={setCode}
            />
            {error ? <Text style={[font.tiny, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text> : null}
            <Button label="Verify & continue" onPress={onVerify} loading={busy} disabled={displayedCode.length !== 6} />
            <View style={{ height: spacing.sm }} />
            <Button label="Back" variant="ghost" onPress={() => { setCode(""); setError(null); void cancelPending(); }} />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={[font.tiny, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text> : null}
            <Button label="Sign in" onPress={onSignIn} loading={busy} disabled={!email || !password} />
            <Text style={[font.tiny, { textAlign: "center", marginTop: spacing.lg }]}>
              This phone becomes your Corelyx Guard 2FA device.
            </Text>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 50,
    color: colors.text,
    marginBottom: spacing.md,
    fontSize: 15,
  },
});
