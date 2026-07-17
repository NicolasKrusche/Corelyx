import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "@/lib/api";
import type { RunListItem } from "@/lib/types";
import { Badge, Card, EmptyState, Loading, Row, Screen, ScreenTitle } from "@/components/ui";
import { colors, font, spacing } from "@/lib/theme";

/** Compact relative-time helper ("5m ago", "3h ago", "2d ago"). */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function RunRow({ item, onPress }: { item: RunListItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ marginBottom: spacing.md }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={[font.title, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
            {item.program_name || "Workflow"}
          </Text>
          <Badge label={item.status} />
        </Row>
        <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
          <Text style={[font.muted, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
            {item.triggered_by || "—"}
          </Text>
          <Text style={font.tiny}>{timeAgo(item.created_at)}</Text>
        </Row>
        {item.error_message ? (
          <Text
            style={[font.tiny, { color: colors.danger, marginTop: spacing.sm }]}
            numberOfLines={2}
          >
            {item.error_message}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

/** Cross-workspace runs feed. */
export default function RunsScreen() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.listRuns();
      setRuns(res.runs ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load runs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <Screen>
      <ScreenTitle title="Runs" />
      {error ? (
        <Text
          style={[
            font.tiny,
            { color: colors.danger, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
          ]}
        >
          {error}
        </Text>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RunRow item={item} onPress={() => router.push("/run/" + item.id)} />
          )}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState title="No runs yet" body="Runs from your workflows will appear here." />
          }
        />
      )}
    </Screen>
  );
}
