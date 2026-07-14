import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, RefreshControl, Text, View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import type { Connection, CreditBalance, Entitlements } from "@/lib/types";
import { Button, Card, Loading, Row, Screen, ScreenTitle } from "@/components/ui";
import { colors, font, radius, spacing } from "@/lib/theme";

type Device = {
  id: string;
  name: string;
  platform: string;
  is_default_2fa: boolean;
  current: boolean;
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  plus: "Solo",
  pro: "Team",
  builder: "Scale",
  unlimited: "Unlimited",
};

function tierLabel(tier?: string): string {
  if (!tier) return "—";
  return TIER_LABELS[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}

function runsLabel(ent: Entitlements | null): string {
  if (!ent) return "—";
  const { current, total } = ent.usage.runs;
  return `${current} / ${total === null ? "Unlimited" : total}`;
}

function creditsLabel(credits: CreditBalance | null): string {
  if (!credits) return "—";
  if (credits.total === null) return "Unlimited";
  if (credits.total === 0) return "Not included";
  return String(credits.total);
}

function apiErrMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Some account data is not available on your plan.";
    return e.message;
  }
  return "Couldn't load some account data.";
}

export default function Account() {
  const { email, signOut } = useAuth();

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const errs: string[] = [];
    const guard = async <T,>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch (e) {
        errs.push(apiErrMessage(e));
        return null;
      }
    };

    const [ent, cred, conns, devs] = await Promise.all([
      guard(api.entitlements()),
      guard(api.creditBalance()),
      guard(api.connections()),
      guard(api.listDevices()),
    ]);

    setEntitlements(ent);
    setCredits(cred);
    setConnections(conns);
    setDevices(devs?.devices ?? null);
    setError(errs[0] ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function openUrl(path: string) {
    Linking.openURL(API_BASE_URL + path).catch(() => {
      Alert.alert("Couldn't open link", "Please manage billing from the Corelyx web app.");
    });
  }

  function confirmRevoke(device: Device) {
    Alert.alert(
      "Revoke device",
      `Revoke "${device.name}"? It will be signed out and can no longer approve sign-ins.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: () => void doRevoke(device.id) },
      ]
    );
  }

  async function doRevoke(id: string) {
    setRevokingId(id);
    try {
      await api.revokeDevice(id);
      await load();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 403)) {
        Alert.alert("Already handled", e.message || "This device was already revoked.");
        await load();
      } else {
        Alert.alert("Couldn't revoke", e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      setRevokingId(null);
    }
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Sign out of Corelyx on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen>
      <ScreenTitle title="Account" />
      {loading ? (
        <Loading label="Loading account…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {error ? <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text> : null}

          {/* Identity + plan */}
          <Card>
            <Text style={font.title} numberOfLines={1}>
              {email ?? "Signed in"}
            </Text>
            <Row style={{ marginTop: spacing.sm, justifyContent: "space-between" }}>
              <Text style={font.muted}>Plan</Text>
              <PlanChip label={tierLabel(entitlements?.tier)} />
            </Row>
          </Card>

          {/* Usage */}
          <Card>
            <Text style={font.title}>Usage</Text>
            <View style={{ marginTop: spacing.sm }}>
              <LabelValue label="Runs this period" value={runsLabel(entitlements)} />
              <LabelValue label="AI credits" value={creditsLabel(credits)} />
            </View>
          </Card>

          {/* Connections */}
          <Card>
            <Text style={font.title}>Connections</Text>
            {connections === null ? (
              <Text style={[font.muted, { marginTop: spacing.sm }]}>Couldn't load connections.</Text>
            ) : connections.length === 0 ? (
              <Text style={[font.muted, { marginTop: spacing.sm }]}>No connections yet.</Text>
            ) : (
              <View style={{ marginTop: spacing.xs }}>
                {connections.map((c, i) => (
                  <Row
                    key={c.id}
                    style={[
                      { paddingVertical: spacing.sm, gap: spacing.sm },
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: c.is_valid ? colors.success : colors.danger,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={font.body} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={font.tiny}>{c.provider}</Text>
                    </View>
                  </Row>
                ))}
              </View>
            )}
          </Card>

          {/* Billing deep-links (App Store IAP: managed on the web) */}
          <View style={{ gap: spacing.sm }}>
            <Button label="Manage plan" variant="secondary" onPress={() => openUrl("/plan")} />
            <Button label="Buy credits" variant="ghost" onPress={() => openUrl("/credits")} />
            <Text style={[font.tiny, { textAlign: "center" }]}>Plans and credits are managed on the Corelyx web app.</Text>
          </View>

          {/* Devices */}
          <Card>
            <Text style={font.title}>Devices</Text>
            {devices === null ? (
              <Text style={[font.muted, { marginTop: spacing.sm }]}>Couldn't load devices.</Text>
            ) : devices.length === 0 ? (
              <Text style={[font.muted, { marginTop: spacing.sm }]}>No devices registered.</Text>
            ) : (
              <View style={{ marginTop: spacing.xs }}>
                {devices.map((d, i) => (
                  <Row
                    key={d.id}
                    style={[
                      { paddingVertical: spacing.sm, justifyContent: "space-between", gap: spacing.sm },
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <Row style={{ gap: spacing.sm, flexWrap: "wrap" }}>
                        <Text style={font.body} numberOfLines={1}>
                          {d.name}
                        </Text>
                        {d.current ? (
                          <Text style={[font.tiny, { color: colors.textMuted }]}>(this device)</Text>
                        ) : null}
                      </Row>
                      <Row style={{ gap: spacing.sm, marginTop: 4, flexWrap: "wrap" }}>
                        <Text style={font.tiny}>{d.platform}</Text>
                        {d.is_default_2fa ? <PlanChip label="2FA default" tone={colors.info} /> : null}
                      </Row>
                    </View>
                    {!d.current ? (
                      <Button
                        label="Revoke"
                        variant="danger"
                        onPress={() => confirmRevoke(d)}
                        loading={revokingId === d.id}
                      />
                    ) : null}
                  </Row>
                ))}
              </View>
            )}
          </Card>

          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </ScrollView>
      )}
    </Screen>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: "space-between", paddingVertical: spacing.xs }}>
      <Text style={font.muted}>{label}</Text>
      <Text style={font.body}>{value}</Text>
    </Row>
  );
}

function PlanChip({ label, tone = colors.primary }: { label: string; tone?: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tone,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={[font.tiny, { color: tone }]}>{label}</Text>
    </View>
  );
}
