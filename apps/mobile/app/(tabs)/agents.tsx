import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "@/lib/api";
import type { AgentFlag, AgentListItem } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  Row,
  Screen,
  ScreenTitle,
} from "@/components/ui";
import { colors, font, radius, spacing } from "@/lib/theme";
import { API_BASE_URL } from "@/lib/config";

/** Small inline relative-time helper (avoids a date library). */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** A rounded muted chip used for "scheduled" and provider hints. */
function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

/** The FlatList is a flat stream of typed rows so the "Needs you", agents, and
 *  flags sections can share one scroller + one RefreshControl. */
type ListRow =
  | { kind: "section"; id: string; title: string }
  | { kind: "agent"; id: string; agent: AgentListItem }
  | { kind: "flag"; id: string; flag: AgentFlag };

/**
 * Agent inbox (Phase 2, Solo+ gated). Lists the user's agents with the ones
 * that need attention (awaiting approval / open question) pinned on top, plus a
 * "Flagged for review" section. A 403 (AGENTS_REQUIRE_UPGRADE) swaps the whole
 * screen for an upsell.
 */
export default function AgentsScreen() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [flags, setFlags] = useState<AgentFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listAgents();
      setAgents(data.agents ?? []);
      setFlags(data.flags ?? []);
      setUpsell(false);
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === "AGENTS_REQUIRE_UPGRADE" || e.status === 403)
      ) {
        setUpsell(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Could not load agents.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  function confirmResolveFlag(flag: AgentFlag, status: "kept" | "dismissed") {
    const verb = status === "kept" ? "Keep" : "Dismiss";
    Alert.alert(
      `${verb} this flag?`,
      flag.subject || flag.snippet || "This flagged item.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: status === "dismissed" ? "destructive" : "default",
          onPress: () => resolveFlag(flag.id, status),
        },
      ]
    );
  }

  async function resolveFlag(id: string, status: "kept" | "dismissed") {
    setBusyFlag(id);
    try {
      await api.resolveFlag(id, status);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        Alert.alert("Already handled", "This flag was already resolved.");
        await load();
      } else if (e instanceof ApiError && e.status === 403) {
        Alert.alert("Not allowed", e.message);
        await load();
      } else {
        Alert.alert(
          "Couldn't update",
          e instanceof ApiError ? e.message : "Something went wrong. Please try again."
        );
      }
    } finally {
      setBusyFlag(null);
    }
  }

  // ── Upsell ──────────────────────────────────────────────────────────────────
  if (upsell) {
    const bullets = [
      "Build, edit, and toggle workflows for you",
      "Check your account: runs, connections, usage",
      "Runs on your connected apps",
    ];
    return (
      <Screen>
        <ScreenTitle title="Agents" />
        <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
          <Card>
            <Text style={font.h2}>Let an agent manage your workflows and account</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {bullets.map((b) => (
                <Row key={b} style={{ alignItems: "flex-start" }}>
                  <Text style={{ color: colors.primary, marginRight: spacing.sm, fontWeight: "700" }}>
                    ✓
                  </Text>
                  <Text style={[font.body, { flex: 1 }]}>{b}</Text>
                </Row>
              ))}
            </View>
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label="Upgrade to Solo"
                onPress={() => {
                  Linking.openURL(API_BASE_URL + "/plan").catch(() => {
                    Alert.alert("Couldn't open", "Visit the Corelyx site to upgrade your plan.");
                  });
                }}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  // ── Build the flattened section stream ──────────────────────────────────────
  const needsYou = agents.filter((a) => a.state === "awaiting_approval" || a.hasQuestion);
  const needsIds = new Set(needsYou.map((a) => a.id));
  const rest = agents.filter((a) => !needsIds.has(a.id));

  const rows: ListRow[] = [];
  if (needsYou.length) {
    rows.push({ kind: "section", id: "sec-needs", title: "Needs you" });
    for (const a of needsYou) rows.push({ kind: "agent", id: `needs-${a.id}`, agent: a });
  }
  if (rest.length) {
    rows.push({
      kind: "section",
      id: "sec-all",
      title: needsYou.length ? "All agents" : "Your agents",
    });
    for (const a of rest) rows.push({ kind: "agent", id: `all-${a.id}`, agent: a });
  }
  if (flags.length) {
    rows.push({ kind: "section", id: "sec-flags", title: "Flagged for review" });
    for (const f of flags) rows.push({ kind: "flag", id: `flag-${f.id}`, flag: f });
  }

  function renderRow({ item }: { item: ListRow }) {
    if (item.kind === "section") {
      return <Text style={styles.sectionHeader}>{item.title.toUpperCase()}</Text>;
    }

    if (item.kind === "agent") {
      const a = item.agent;
      return (
        <Pressable
          onPress={() => router.push("/agent/" + a.id)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Card style={{ marginBottom: spacing.md }}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={[font.title, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Badge label={a.state} />
            </Row>
            {a.description ? (
              <Text style={[font.muted, { marginTop: spacing.xs }]} numberOfLines={2}>
                {a.description}
              </Text>
            ) : null}
            <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
              {a.scheduled ? <Chip label="🗓 Scheduled" /> : <View />}
              <Text style={font.tiny}>{timeAgo(a.createdAt)}</Text>
            </Row>
          </Card>
        </Pressable>
      );
    }

    // Flag row.
    const f = item.flag;
    const busy = busyFlag === f.id;
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Row style={{ justifyContent: "space-between", marginBottom: spacing.xs }}>
          <Text style={[font.title, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
            {f.subject || "Flagged item"}
          </Text>
          <Text style={font.tiny}>{timeAgo(f.createdAt)}</Text>
        </Row>
        {f.snippet ? (
          <Text style={[font.muted, { marginBottom: spacing.xs }]} numberOfLines={2}>
            {f.snippet}
          </Text>
        ) : null}
        {f.reason ? (
          <Text style={[font.tiny, { color: colors.textMuted, marginBottom: spacing.sm }]} numberOfLines={3}>
            Why: {f.reason}
          </Text>
        ) : null}
        {f.sourceProvider ? (
          <Row style={{ marginBottom: spacing.sm }}>
            <Chip label={f.sourceProvider} />
          </Row>
        ) : null}
        <Row style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Keep"
              variant="secondary"
              loading={busy}
              disabled={!!busyFlag && !busy}
              onPress={() => confirmResolveFlag(f, "kept")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Dismiss"
              variant="ghost"
              disabled={!!busyFlag}
              onPress={() => confirmResolveFlag(f, "dismissed")}
            />
          </View>
        </Row>
      </Card>
    );
  }

  return (
    <Screen>
      <ScreenTitle title="Agents" />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <Loading label="Loading your agents…" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No agents yet"
              body="Agents you create show up here, along with anything they need from you."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  sectionHeader: {
    ...font.tiny,
    color: colors.textFaint,
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.surfaceAlt,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
});
