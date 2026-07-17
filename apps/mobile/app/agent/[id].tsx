import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "@/lib/api";
import type { AgentDetail, AgentReport } from "@/lib/types";
import { Badge, Button, Card, Loading, Row, Screen } from "@/components/ui";
import { colors, font, radius, spacing } from "@/lib/theme";

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

/** A run in one of these states is still in flight → keep polling. */
function isActiveStatus(status: string | null | undefined): boolean {
  return status === "running" || status === "pending";
}

function toneColor(tone: string | undefined): string {
  switch (tone) {
    case "good":
      return colors.success;
    case "warn":
      return colors.warn;
    case "bad":
      return colors.danger;
    default:
      return colors.text;
  }
}

function MetricsRows({ report }: { report: AgentReport }) {
  const metrics = report.data?.metrics ?? [];
  if (!metrics.length) return null;
  return (
    <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
      {metrics.map((m, i) => (
        <Row key={`${m.label}-${i}`} style={{ justifyContent: "space-between" }}>
          <Text style={[font.muted, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
            {m.label}
          </Text>
          <Text style={[font.body, { color: toneColor(m.tone), fontWeight: "600" }]}>
            {String(m.value)}
          </Text>
        </Row>
      ))}
    </View>
  );
}

/**
 * Agent detail — capabilities, any pending questions the agent is asking, its
 * report history, and run controls. Polls itself every 3s while a run is in
 * flight so the newest report and status land without a manual refresh.
 */
export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "run" | "dry" | "clone">(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) return;
      try {
        if (!opts?.silent) setError(null);
        const data = await api.getAgent(id);
        setDetail(data);
      } catch (e) {
        if (!opts?.silent) {
          setError(e instanceof ApiError ? e.message : "Could not load this agent.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      setLoading(true);
      return load();
    });
  }, [load]);

  // Poll while the latest run is still active.
  const active = isActiveStatus(detail?.latestRun?.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => load({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [active, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  function handleErr(e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      Alert.alert("Already handled", "This was already updated.");
      load();
      return;
    }
    if (e instanceof ApiError && e.status === 403) {
      Alert.alert("Not allowed", e.message);
      load();
      return;
    }
    Alert.alert(
      "Couldn't complete",
      e instanceof ApiError ? e.message : "Something went wrong. Please try again."
    );
  }

  function confirmRun(dryRun: boolean) {
    Alert.alert(
      dryRun ? "Dry run this agent?" : "Run this agent?",
      dryRun
        ? "Simulates the run without changing anything in your connected apps."
        : "The agent will run and may act on your connected apps.",
      [
        { text: "Cancel", style: "cancel" },
        { text: dryRun ? "Dry run" : "Run", onPress: () => runAgent(dryRun) },
      ]
    );
  }

  async function runAgent(dryRun: boolean) {
    if (!id) return;
    setBusy(dryRun ? "dry" : "run");
    try {
      await api.runAgent(id, dryRun);
      await load(); // picks up latestRun → polling effect takes over
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(null);
    }
  }

  function confirmClone() {
    Alert.alert("Run this agent again?", "Creates a fresh copy of this agent and opens it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Run again", onPress: cloneAgent },
    ]);
  }

  async function cloneAgent() {
    if (!id) return;
    setBusy("clone");
    try {
      const res = await api.cloneAgent(id);
      router.replace("/agent/" + res.agent.id);
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(null);
    }
  }

  async function submitAnswer(qid: string) {
    const answer = (answers[qid] ?? "").trim();
    if (!answer) return;
    setAnswering(qid);
    try {
      await api.answerQuestion(qid, answer);
      setAnswers((a) => ({ ...a, [qid]: "" }));
      await load();
    } catch (e) {
      handleErr(e);
    } finally {
      setAnswering(null);
    }
  }

  function confirmDecline(qid: string) {
    Alert.alert("Decline this question?", "The agent won't receive an answer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => declineQuestion(qid) },
    ]);
  }

  async function declineQuestion(qid: string) {
    setAnswering(qid);
    try {
      await api.declineQuestion(qid);
      await load();
    } catch (e) {
      handleErr(e);
    } finally {
      setAnswering(null);
    }
  }

  const reports = useMemo(() => {
    const list = detail?.reports ?? [];
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [detail]);

  if (loading) return <Screen><Loading label="Loading agent…" /></Screen>;

  if (!detail) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <Text style={[font.title, { textAlign: "center" }]}>Agent unavailable</Text>
          {error ? (
            <Text style={[font.muted, { textAlign: "center", marginTop: spacing.xs }]}>{error}</Text>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  const agent = detail.agent;
  const caps = agent.capabilities ?? {};
  const state = agent.state;
  const canRun = state === "awaiting_approval" || state === "approved";
  const canClone = state === "completed";
  const questions = detail.pendingQuestions ?? [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* Header */}
        <Card>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={[font.h2, { flex: 1, marginRight: spacing.sm }]}>{agent.name}</Text>
            <Badge label={state} />
          </Row>
          {agent.scheduled ? (
            <View style={styles.chip}>
              <Text style={font.tiny}>🗓 Scheduled</Text>
            </View>
          ) : null}
          {agent.description ? (
            <Text style={[font.body, { marginTop: spacing.sm, color: colors.textMuted }]}>
              {agent.description}
            </Text>
          ) : null}
        </Card>

        {/* Capabilities */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[font.tiny, styles.cardLabel]}>CAPABILITIES</Text>
          <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
            <Text style={font.muted}>Can make changes</Text>
            <Text style={[font.body, { color: caps.allow_writes ? colors.success : colors.textMuted }]}>
              {caps.allow_writes ? "Yes" : "No"}
            </Text>
          </Row>
          <Row style={{ justifyContent: "space-between", marginTop: spacing.sm }}>
            <Text style={font.muted}>Max spend</Text>
            <Text style={font.body}>
              {typeof caps.max_cost_usd === "number" ? `$${caps.max_cost_usd.toFixed(2)}` : "—"}
            </Text>
          </Row>
        </Card>

        {/* Active-run banner */}
        {active ? (
          <Card style={{ marginTop: spacing.md }}>
            <Row>
              <ActivityIndicator color={colors.primary} />
              <Text style={[font.body, { marginLeft: spacing.sm }]}>
                Run {detail.latestRun?.status}…
              </Text>
            </Row>
          </Card>
        ) : null}

        {/* Pending questions */}
        {questions.length ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionHeader}>NEEDS YOU</Text>
            {questions.map((q) => {
              const qBusy = answering === q.id;
              const draft = answers[q.id] ?? "";
              return (
                <Card key={q.id} style={{ marginBottom: spacing.md }}>
                  <Text style={[font.body, { marginBottom: spacing.sm }]}>{q.question}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Type your answer…"
                    placeholderTextColor={colors.textFaint}
                    value={draft}
                    onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
                    multiline
                    editable={!qBusy}
                  />
                  <Row style={{ gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Send"
                        loading={qBusy}
                        disabled={!draft.trim() || qBusy}
                        onPress={() => submitAnswer(q.id)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Decline"
                        variant="ghost"
                        disabled={qBusy}
                        onPress={() => confirmDecline(q.id)}
                      />
                    </View>
                  </Row>
                </Card>
              );
            })}
          </View>
        ) : null}

        {/* Run controls */}
        {canRun ? (
          <Row style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Run"
                loading={busy === "run"}
                disabled={busy !== null || active}
                onPress={() => confirmRun(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Dry run"
                variant="secondary"
                loading={busy === "dry"}
                disabled={busy !== null || active}
                onPress={() => confirmRun(true)}
              />
            </View>
          </Row>
        ) : null}

        {canClone ? (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Run again"
              loading={busy === "clone"}
              disabled={busy !== null}
              onPress={confirmClone}
            />
          </View>
        ) : null}

        {/* Reports */}
        {reports.length ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionHeader}>REPORTS</Text>
            {reports.map((r) => (
              <Card key={r.id} style={{ marginBottom: spacing.md }}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={[font.title, { flex: 1, marginRight: spacing.sm }]}>{r.title}</Text>
                  {r.data?.outcome ? <Badge label={r.data.outcome} /> : null}
                </Row>
                <Row style={{ marginTop: spacing.xs, gap: spacing.sm }}>
                  {r.dry_run ? (
                    <View style={styles.chip}>
                      <Text style={font.tiny}>Dry run</Text>
                    </View>
                  ) : null}
                  <Text style={font.tiny}>{timeAgo(r.created_at)}</Text>
                </Row>
                <MetricsRows report={r} />
                {r.body ? (
                  <View style={styles.reportBody}>
                    <Text style={styles.mono}>{r.body}</Text>
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  cardLabel: { color: colors.textFaint, letterSpacing: 0.6 },
  sectionHeader: {
    ...font.tiny,
    color: colors.textFaint,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  chip: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.surfaceAlt,
  },
  errorBanner: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 72,
    color: colors.text,
    marginBottom: spacing.sm,
    fontSize: 15,
    textAlignVertical: "top",
  },
  reportBody: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mono: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
