import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Chip, IconTile, Loading, Row, Screen, ScreenTitle } from "@/components/ui";
import { colors, font, radius, spacing } from "@/lib/theme";

type Challenge = { id: string; requester_label: string | null; requester_ip: string | null; expires_at: string };

export default function Guard() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const res = await api.pendingTwoFactor();
      setChallenge(res.challenge);
      if (res.challenge) setResult(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : "Could not check for requests.");
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadPending(),
      api
        .listDevices()
        .then((r) => {
          const current = r.devices.find((d) => d.current);
          setIsDefault(current ? current.is_default_2fa : null);
        })
        .catch(() => setIsDefault(null)),
    ]);
    setLoading(false);
  }, [loadPending]);

  useEffect(() => {
    void Promise.resolve().then(loadAll);
    timer.current = setInterval(loadPending, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [loadAll, loadPending]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function decide(decision: "approve" | "deny") {
    if (!challenge) return;
    setBusy(decision);
    setError(null);
    try {
      await api.approve2fa(challenge.id, decision);
      setResult(decision === "approve" ? "Sign-in approved ✓" : "Sign-in denied");
      setChallenge(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Loading label="Loading Guard…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle title="Guard" subtitle="Approve Corelyx sign-ins from this phone" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {challenge ? (
          // A live sign-in request awaiting approval.
          <Card style={{ borderColor: colors.primaryBorder, gap: spacing.md }}>
            <Row style={{ gap: spacing.md }}>
              <IconTile name="log-in-outline" tone="primary" />
              <View style={{ flex: 1 }}>
                <Text style={font.title}>Approve this sign-in?</Text>
                <Text style={font.muted}>Only approve if this is you.</Text>
              </View>
            </Row>
            <View style={{ gap: spacing.sm, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, padding: spacing.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={font.muted}>From</Text>
                <Text style={font.body}>{challenge.requester_label || "a web browser"}</Text>
              </Row>
              {challenge.requester_ip ? (
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={font.muted}>IP address</Text>
                  <Text style={font.body}>{challenge.requester_ip}</Text>
                </Row>
              ) : null}
            </View>
            {error ? <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text> : null}
            <Button label="Approve" icon="checkmark-circle-outline" onPress={() => decide("approve")} loading={busy === "approve"} />
            <Button label="Deny" variant="danger" icon="close-circle-outline" onPress={() => decide("deny")} loading={busy === "deny"} />
          </Card>
        ) : (
          <>
            {/* Status */}
            <Card style={{ gap: spacing.md }}>
              <Row style={{ gap: spacing.md }}>
                <IconTile name="shield-checkmark" tone={isDefault === false ? "muted" : "success"} />
                <View style={{ flex: 1 }}>
                  <Text style={font.title}>
                    {isDefault === false ? "Guard is set up on another phone" : "Corelyx Guard is active"}
                  </Text>
                  <Text style={font.muted}>
                    {isDefault === false
                      ? "Sign-in requests go to your default 2FA device."
                      : "Sign-in requests to your account appear here."}
                  </Text>
                </View>
              </Row>
              {isDefault ? <Chip label="This phone is your 2FA device" icon="phone-portrait-outline" tone="success" /> : null}
            </Card>

            {/* No pending request */}
            <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
              <IconTile name="lock-closed-outline" tone="muted" size={52} />
              <Text style={font.title}>No sign-in requests</Text>
              <Text style={[font.muted, { textAlign: "center", paddingHorizontal: spacing.lg }]}>
                {result ?? "When you sign in to Corelyx on the web, the request shows up here to approve or deny."}
              </Text>
            </View>
          </>
        )}

        {/* How it works */}
        <Card style={{ gap: spacing.sm }}>
          <Row style={{ gap: spacing.sm }}>
            <IconTile name="information-circle-outline" tone="info" size={32} />
            <Text style={font.title}>How Guard works</Text>
          </Row>
          <Text style={font.muted}>
            Signing in to Corelyx sends a request to this phone. One tap approves or denies it — no codes to type. If a
            request ever looks unfamiliar, deny it: your account stays protected.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
