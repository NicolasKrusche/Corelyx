"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export function ApprovalsRealtimeRefresh({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("approvals-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals", filter: `user_id=eq.${userId}` },
        () => {
          router.refresh();
          // Notify the sidebar + notification center so their badges update
          // even if their own realtime subscription missed this event.
          window.dispatchEvent(new CustomEvent("approval-changed"));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [router, userId]);

  return null;
}
