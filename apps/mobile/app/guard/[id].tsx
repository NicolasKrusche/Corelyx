import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { Button, Card, Row, Screen } from "@/components/ui";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Corelyx Guard — approve or deny a sign-in. Reached by tapping the 2FA push (or
 * deep link) with the challenge id. One tap, no code to type. Approving lets the
 * web sign-in complete (its status poll mints the trust cookie); denying blocks
 * it.
 */
export default function Guard() {
  const params = useLocalSearchParams<{ id: string; label?: string; ip?: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [result, setResult] = useState<null | "approved" | "denied" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  const label = params.label && params.label.length > 0 ? params.label : "a web browser";

  async function decide(decision: "approve" | "deny") {
    if (!params.id) return;
    setBusy(decision);
    setError(null);
    try {
      await api.approve2fa(params.id, decision);
      setResult(decision === "approve" ? "approved" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete.");
      setResult("error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 44 }}>{result === "approved" ? "✅" : result === "denied" ? "🛑" : "🔐"}</Text>
          <Text style={[font.h2, { marginTop: spacing.sm, textAlign: "center" }]}>
            {result === "approved"
              ? "Sign-in approved"
              : result === "denied"
              ? "Sign-in denied"
              : "Approve this sign-in?"}
          </Text>
        </View>

        {result === null ? (
          <>
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={font.muted}>From</Text>
                <Text style={font.title}>{label}</Text>
              </Row>
              {params.ip ? (
                <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
                  <Text style={font.muted}>IP address</Text>
                  <Text style={font.body}>{params.ip}</Text>
                </Row>
              ) : null}
              <Text style={[font.tiny, { marginTop: spacing.md }]}>
                Only approve if this is you. Denying will block the sign-in.
              </Text>
            </Card>

            {error ? <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text> : null}

            <Button label="Approve" onPress={() => decide("approve")} loading={busy === "approve"} />
            <Button label="Deny" variant="danger" onPress={() => decide("deny")} loading={busy === "deny"} />
          </>
        ) : (
          <Button label="Done" variant="secondary" onPress={() => router.back()} />
        )}
      </View>
    </Screen>
  );
}
