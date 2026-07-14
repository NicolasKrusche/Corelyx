import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError } from "@/lib/api";
import type { AgentListItem, ApprovalItem } from "@/lib/types";
import { Badge, Button, Card, Chip, EmptyState, Loading, Row, Screen, ScreenTitle } from "@/components/ui";
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
  return `${d}d ago`;
}

/**
 * Inbox — the "needs you" home. One endpoint (api.listApprovals) returns two
 * kinds of item; we discriminate on context.kind:
 *   - "question" → an agent is asking the user something (Answer / Decline).
 *   - otherwise  → a workflow step is waiting on an approval (Approve / Reject).
 */
export default function Inbox() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  // Agents in the "awaiting_approval" state — their plan is ready and needs the
  // user to approve it before it runs. These are programs rows, not approvals
  // rows, so we fetch them separately and surface them at the top of the inbox.
  const [agentApprovals, setAgentApprovals] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Composite busy key `${itemId}:${action}` so one row action spins without
  // disabling every card, and sibling buttons on the same row just grey out.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Inline answer editor state (which question row is open + its draft).
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  const rowBusy = (id: string) => !!busyKey && busyKey.startsWith(`${id}:`);

  async function load() {
    setError(null);
    try {
      const { approvals } = await api.listApprovals();
      setItems(approvals);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(
          e.code === "AGENTS_REQUIRE_UPGRADE"
            ? "Agent questions need an upgraded plan."
            : e.message
        );
      } else {
        setError("Could not load your inbox.");
      }
      if (items === null) setItems([]);
    }
    // Agents awaiting plan approval. Best-effort: on Free tier (or if the agents
    // table is absent) this 403s / errors — that's fine, just show no agents.
    try {
      const { agents } = await api.listAgents();
      setAgentApprovals(agents.filter((a) => a.state === "awaiting_approval"));
    } catch {
      setAgentApprovals([]);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  /** Shared error surfacing for a side-effectful action; refreshes on 409. */
  async function handleActionError(e: unknown) {
    if (e instanceof ApiError) {
      if (e.status === 403 && e.code === "FEATURE_NOT_AVAILABLE") {
        Alert.alert("Team feature", "Approvals are a Team feature.");
        return; // keep the row as-is
      }
      if (e.status === 409) {
        Alert.alert("Already handled", "Someone already handled this item.");
        await load();
        return;
      }
      if (e.status === 403) {
        Alert.alert("Not allowed", e.message);
        await load();
        return;
      }
      Alert.alert("Couldn't complete", e.message);
      return;
    }
    Alert.alert("Couldn't complete", "Something went wrong. Please try again.");
  }

  function confirmDecide(item: ApprovalItem, decision: "approved" | "rejected") {
    const verb = decision === "approved" ? "Approve" : "Reject";
    const what = item.context?.node_label ?? "this step";
    Alert.alert(`${verb}?`, `${verb} "${what}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: verb,
        style: decision === "rejected" ? "destructive" : "default",
        onPress: () => decide(item, decision),
      },
    ]);
  }

  async function decide(item: ApprovalItem, decision: "approved" | "rejected") {
    setBusyKey(`${item.id}:${decision}`);
    try {
      await api.decideApproval(item.id, decision);
      await load();
    } catch (e) {
      await handleActionError(e);
    } finally {
      setBusyKey(null);
    }
  }

  function confirmDecline(item: ApprovalItem) {
    Alert.alert("Decline question?", "The agent won't receive an answer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => decline(item) },
    ]);
  }

  async function decline(item: ApprovalItem) {
    setBusyKey(`${item.id}:decline`);
    try {
      await api.declineQuestion(item.id);
      await load();
    } catch (e) {
      await handleActionError(e);
    } finally {
      setBusyKey(null);
    }
  }

  async function submitAnswer(item: ApprovalItem) {
    const answer = answerText.trim();
    if (!answer) return;
    setBusyKey(`${item.id}:answer`);
    try {
      await api.answerQuestion(item.id, answer);
      setAnsweringId(null);
      setAnswerText("");
      await load();
    } catch (e) {
      await handleActionError(e);
    } finally {
      setBusyKey(null);
    }
  }

  function renderItem({ item }: { item: ApprovalItem }) {
    const ctx = item.context ?? {};
    const isQuestion = ctx.kind === "question";
    const programName = item.node_executions?.runs?.programs?.name;
    const runId = item.node_executions?.run_id;
    const answering = answeringId === item.id;
    const busy = rowBusy(item.id);
    const approveKey = `${item.id}:approved`;
    const rejectKey = `${item.id}:rejected`;
    const declineKey = `${item.id}:decline`;
    const answerKey = `${item.id}:answer`;

    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Row style={{ justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Badge label={isQuestion ? "question" : "approval"} />
          <Text style={font.tiny}>{timeAgo(item.created_at)}</Text>
        </Row>

        {programName ? (
          <Text style={[font.muted, { marginBottom: spacing.xs }]}>{programName}</Text>
        ) : null}

        {isQuestion ? (
          <Text style={[font.body, { marginBottom: spacing.sm }]}>
            {ctx.question ?? "The agent needs your input."}
          </Text>
        ) : (
          <>
            <Text style={[font.title, { marginBottom: 2 }]}>{ctx.node_label ?? "Approval required"}</Text>
            {ctx.reason ? (
              <Text style={[font.muted, { marginBottom: spacing.sm }]}>{ctx.reason}</Text>
            ) : (
              <View style={{ height: spacing.xs }} />
            )}
          </>
        )}

        {runId ? (
          <Pressable onPress={() => router.push(`/run/${runId}`)} hitSlop={8} style={{ marginBottom: spacing.sm }}>
            <Text style={[font.tiny, { color: colors.primary }]}>View run →</Text>
          </Pressable>
        ) : null}

        {isQuestion && answering ? (
          <TextInput
            style={styles.input}
            placeholder="Type your answer…"
            placeholderTextColor={colors.textFaint}
            value={answerText}
            onChangeText={setAnswerText}
            multiline
            autoFocus
            editable={!busy}
          />
        ) : null}

        <Row style={{ gap: spacing.sm }}>
          {isQuestion ? (
            answering ? (
              <>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Send"
                    onPress={() => submitAnswer(item)}
                    loading={busyKey === answerKey}
                    disabled={!answerText.trim() || (busy && busyKey !== answerKey)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => {
                      setAnsweringId(null);
                      setAnswerText("");
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Answer"
                    disabled={busy}
                    onPress={() => {
                      setAnsweringId(item.id);
                      setAnswerText("");
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Decline"
                    variant="ghost"
                    loading={busyKey === declineKey}
                    disabled={busy && busyKey !== declineKey}
                    onPress={() => confirmDecline(item)}
                  />
                </View>
              </>
            )
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Button
                  label="Approve"
                  loading={busyKey === approveKey}
                  disabled={busy && busyKey !== approveKey}
                  onPress={() => confirmDecide(item, "approved")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Reject"
                  variant="danger"
                  loading={busyKey === rejectKey}
                  disabled={busy && busyKey !== rejectKey}
                  onPress={() => confirmDecide(item, "rejected")}
                />
              </View>
            </>
          )}
        </Row>
      </Card>
    );
  }

  const count = (items?.length ?? 0) + agentApprovals.length;
  const subtitle = loading
    ? "Loading…"
    : count > 0
    ? `${count} item${count === 1 ? "" : "s"} need you`
    : "Nothing needs you right now";

  const header =
    agentApprovals.length > 0 ? (
      <View>
        {agentApprovals.map((agent) => (
          <Card key={agent.id} style={{ marginBottom: spacing.md }}>
            <Row style={{ justifyContent: "space-between", marginBottom: spacing.sm }}>
              <Chip label="Agent · needs approval" icon="sparkles" tone="warn" />
              <Text style={font.tiny}>{timeAgo(agent.createdAt)}</Text>
            </Row>
            <Text style={[font.title, { marginBottom: 2 }]}>{agent.name}</Text>
            {agent.description ? (
              <Text style={[font.muted, { marginBottom: spacing.sm }]} numberOfLines={2}>
                {agent.description}
              </Text>
            ) : (
              <View style={{ height: spacing.xs }} />
            )}
            <Text style={[font.muted, { marginBottom: spacing.sm }]}>
              This agent&apos;s plan is ready — review and approve it to run.
            </Text>
            <Button label="Review & approve" icon="arrow-forward" onPress={() => router.push(`/agent/${agent.id}`)} />
          </Card>
        ))}
      </View>
    ) : null;

  return (
    <Screen>
      <ScreenTitle title="Inbox" subtitle={subtitle} />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={[font.tiny, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <Loading label="Loading your inbox…" />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          extraData={{ answeringId, answerText, busyKey, agentApprovals }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            agentApprovals.length > 0 ? null : (
              <EmptyState
                icon="checkmark-done-circle-outline"
                title="You're all caught up"
                body="Approvals, agent questions, and agents awaiting approval show up here when they need you."
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
});
