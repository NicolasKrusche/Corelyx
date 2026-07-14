import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, ApiError } from "@/lib/api";
import type { RunDetail } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Loading, Row, Screen } from "@/components/ui";
import { colors, font, spacing } from "@/lib/theme";

/** A run is done once it reaches one of these; otherwise we keep polling. */
const TERMINAL = ["completed", "success", "failed", "cancelled"];
/** Statuses where the user may still stop the run. */
const CANCELLABLE = ["running", "pending", "waiting_approval", "paused"];

function isTerminal(status: string): boolean {
  return TERMINAL.includes(status.toLowerCase());
}

/** Format an ISO timestamp for the header rows; em-dash when absent. */
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={font.muted}>{label}</Text>
      <Text style={[font.body, { flex: 1, textAlign: "right", marginLeft: spacing.md }]} numberOfLines={1}>
        {value}
      </Text>
    </Row>
  );
}

/** Run detail: header, telemetry, node-execution timeline; live-polls while active. */
export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const d = await api.getRun(id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load run.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 3s while the run is non-terminal; clean up on unmount / when it finishes.
  const status = detail?.run.status;
  useEffect(() => {
    if (!status || isTerminal(status)) return;
    const t = setInterval(() => {
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [status, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmCancel() {
    Alert.alert(
      "Cancel run",
      "Stop this run? Steps already completed cannot be undone.",
      [
        { text: "Keep running", style: "cancel" },
        { text: "Cancel run", style: "destructive", onPress: doCancel },
      ]
    );
  }

  async function doCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await api.cancelRun(id);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 403)) {
        Alert.alert("Already handled", e.message);
      } else {
        Alert.alert("Could not cancel", e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      setCancelling(false);
      await load();
    }
  }

  if (loading && !detail) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen>
        <EmptyState title="Run unavailable" body={error ?? "This run could not be loaded."} />
      </Screen>
    );
  }

  const { run, program, node_executions } = detail;
  const nodes = program.schema?.nodes ?? [];
  const nodeLabel = (nodeId: string): string => {
    const n = nodes.find((x) => x.id === nodeId);
    return n?.label || n?.type || nodeId;
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <Card>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={[font.h2, { flex: 1, marginRight: spacing.sm }]} numberOfLines={2}>
              {program.name || "Workflow"}
            </Text>
            <Badge label={run.status} />
          </Row>
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <MetaRow label="Triggered by" value={run.triggered_by || "—"} />
            <MetaRow label="Created" value={fmt(run.created_at)} />
            <MetaRow label="Started" value={fmt(run.started_at)} />
            <MetaRow label="Completed" value={fmt(run.completed_at)} />
          </View>
          {run.error_message ? (
            <Text style={[font.tiny, { color: colors.danger, marginTop: spacing.md }]}>
              {run.error_message}
            </Text>
          ) : null}
        </Card>

        {/* Telemetry */}
        <Card style={{ marginTop: spacing.md }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <Text style={font.tiny}>Total tokens</Text>
              <Text style={[font.title, { marginTop: 2 }]}>
                {(run.total_tokens ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={font.tiny}>Est. cost</Text>
              <Text style={[font.title, { marginTop: 2 }]}>
                ${(run.estimated_cost_usd ?? 0).toFixed(4)}
              </Text>
            </View>
          </Row>
        </Card>

        {/* Cancel */}
        {CANCELLABLE.includes(run.status.toLowerCase()) ? (
          <View style={{ marginTop: spacing.md }}>
            <Button label="Cancel run" variant="danger" onPress={confirmCancel} loading={cancelling} />
          </View>
        ) : null}

        {/* Timeline */}
        <Text style={[font.h2, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Timeline</Text>
        {node_executions.length === 0 ? (
          <Text style={[font.muted, { marginBottom: spacing.md }]}>No steps recorded yet.</Text>
        ) : (
          node_executions.map((ne) => (
            <Card key={ne.id} style={{ marginBottom: spacing.sm }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={[font.title, { flex: 1, marginRight: spacing.sm }]} numberOfLines={2}>
                  {nodeLabel(ne.node_id)}
                </Text>
                <Badge label={ne.status} />
              </Row>
              {ne.error_message ? (
                <Text
                  style={[font.tiny, { color: colors.danger, marginTop: spacing.xs }]}
                  numberOfLines={3}
                >
                  {ne.error_message}
                </Text>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
