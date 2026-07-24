"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Check, X, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProgramComment {
  id: string;
  program_id: string;
  node_id: string;
  user_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CommentOverlayProps {
  programId: string;
  nodeId: string;
  currentUserId: string;
  /** Total unresolved comments on this node — shown as badge count. */
  unresolvedCount: number;
  /** Whether to show the comment panel open for this node. */
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCommentCountChange?: (nodeId: string, count: number) => void;
}

// ─── Comment Panel ──────────────────────────────────────────────────────────

function CommentItem({
  comment,
  currentUserId,
  onResolve,
  onDelete,
}: {
  comment: ProgramComment;
  currentUserId: string;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
}) {
  const isAuthor = comment.user_id === currentUserId;
  const initials = comment.display_name
    ? comment.display_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-2.5 text-xs",
        comment.resolved
          ? "border-muted bg-muted/30 opacity-60"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Avatar */}
        {comment.avatar_url ? (
          <img
            src={comment.avatar_url}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              {comment.display_name ?? "Anonymous"}
            </span>
            <span className="text-muted-foreground/60">
              {new Date(comment.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {comment.resolved && (
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] font-medium text-emerald-600">
                <Check className="h-2.5 w-2.5" /> Resolved
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-foreground/90">{comment.body}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!comment.resolved && (
          <button
            onClick={() => onResolve(comment.id, true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-emerald-600"
            title="Resolve"
          >
            <Check className="h-3 w-3" />
          </button>
        )}
        {comment.resolved && (
          <button
            onClick={() => onResolve(comment.id, false)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-amber-600"
            title="Reopen"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {isAuthor && (
          <button
            onClick={() => onDelete(comment.id)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Overlay ───────────────────────────────────────────────────────────

export function CommentOverlay({
  programId,
  nodeId,
  currentUserId,
  unresolvedCount,
  isOpen,
  onToggle,
  onClose,
  onCommentCountChange,
}: CommentOverlayProps) {
  const [comments, setComments] = useState<ProgramComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch comments when panel opens
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/programs/${programId}/comments?node_id=${encodeURIComponent(nodeId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
        const unresolved = (data.comments ?? []).filter(
          (c: ProgramComment) => !c.resolved
        ).length;
        onCommentCountChange?.(nodeId, unresolved);
      }
    } finally {
      setLoading(false);
    }
  }, [programId, nodeId, onCommentCountChange]);

  useEffect(() => {
    if (isOpen) fetchComments();
  }, [isOpen, fetchComments]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    const body = newComment.trim();
    if (!body) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/programs/${programId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: nodeId, body }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
        onCommentCountChange?.(
          nodeId,
          comments.filter((c) => !c.resolved).length + 1
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    const res = await fetch(`/api/programs/${programId}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId, resolved }),
    });
    if (res.ok) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, resolved } : c))
      );
      const newCount = comments.filter(
        (c) => !c.resolved && c.id !== commentId
      ).length + (resolved ? 0 : 1);
      onCommentCountChange?.(nodeId, newCount);
    }
  };

  const handleDelete = async (commentId: string) => {
    const res = await fetch(
      `/api/programs/${programId}/comments?comment_id=${commentId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const deleted = comments.find((c) => c.id === commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      if (deleted && !deleted.resolved) {
        onCommentCountChange?.(
          nodeId,
          comments.filter((c) => !c.resolved).length - 1
        );
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <>
      {/* Comment indicator badge — always visible on the node */}
      {!isOpen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "absolute -right-2 -top-2 z-20 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-bold shadow-md transition-transform hover:scale-110",
            unresolvedCount > 0
              ? "bg-blue-500 text-white"
              : "bg-muted text-muted-foreground"
          )}
          title={`${unresolvedCount} unresolved comment${unresolvedCount !== 1 ? "s" : ""}`}
        >
          <MessageSquare className="h-2.5 w-2.5" />
          {unresolvedCount > 0 && <span>{unresolvedCount}</span>}
        </button>
      )}

      {/* Comment panel — rendered as a floating popover next to the node */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute -right-2 top-0 z-30 w-64 -translate-y-full -translate-x-0 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-foreground">
                Comments
                {resolvedCount > 0 && (
                  <span className="ml-1 text-muted-foreground/60">
                    ({resolvedCount} resolved)
                  </span>
                )}
              </span>
              <button
                onClick={onClose}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Comment list */}
            <div className="max-h-48 space-y-2 overflow-y-auto p-2">
              {loading && (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  Loading…
                </p>
              )}
              {!loading && comments.length === 0 && (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  No comments yet. Be the first to comment on this node.
                </p>
              )}
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onResolve={handleResolve}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            {/* New comment input */}
            <div className="border-t border-border p-2">
              <Textarea
                ref={textareaRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment…"
                rows={2}
                className="nodrag nopan resize-none text-xs"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/60">
                  ⌘+Enter to submit
                </span>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!newComment.trim() || submitting}
                  onClick={handleSubmit}
                  className="h-6 gap-1 px-2 text-[11px]"
                >
                  <Send className="h-3 w-3" />
                  {submitting ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
