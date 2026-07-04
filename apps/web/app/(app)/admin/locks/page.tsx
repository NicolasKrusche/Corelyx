import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import { Lock, Unlock, Clock } from "lucide-react";

type CredentialLockRow = {
  lock_key: string;
  lock_id: string;
  created_at: string;
  expires_at: string;
};

async function getActiveLocks() {
  const db = createServiceClient();
  
  const { data: locks } = await db
    .from("credential_locks")
    .select("lock_key, lock_id, created_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  
  return (locks ?? []) as unknown as CredentialLockRow[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default async function CredentialLocksPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const locks = await getActiveLocks();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Credential Locks</h1>
        <p className="text-muted-foreground">
          Active distributed locks for OAuth token refresh
        </p>
      </div>
      
      {/* Stats */}
      <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-full ${
            locks.length > 0 ? "bg-blue-500/15" : "bg-green-500/15"
          }`}>
            {locks.length > 0 ? (
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ) : (
              <Unlock className="w-6 h-6 text-green-600 dark:text-green-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Active Locks</p>
            <p className="text-2xl font-bold text-foreground">{locks.length}</p>
          </div>
        </div>
      </div>
      
      {/* Locks Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Active Credential Locks
          </h2>
        </div>
        
        {locks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Unlock className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p>No active locks</p>
            <p className="text-sm">All credential operations are available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Lock Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Lock ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Expires In
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {locks.map((lock) => {
                  const expiresIn = Math.floor(
                    (new Date(lock.expires_at).getTime() - Date.now()) / 1000
                  );
                  
                  return (
                    <tr key={lock.lock_key} className="hover:bg-muted/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">
                        {lock.lock_key}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">
                        {lock.lock_id.slice(0, 16)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(lock.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(expiresIn)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Info Box */}
      <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 p-6">
        <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">
          About Credential Locks
        </h3>
        <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
          <p>
            <strong>Purpose:</strong> Prevent race conditions when multiple runs 
            try to refresh the same OAuth token simultaneously.
          </p>
          <p>
            <strong>How it works:</strong> When a run needs to refresh a token, 
            it acquires a lock. Other runs wait until the lock is released.
          </p>
          <p>
            <strong>Timeout:</strong> Locks automatically expire after 30 seconds 
            to prevent deadlocks.
          </p>
          <p>
            <strong>Normal state:</strong> Locks should be brief (sub-second). 
            If you see many locks persisting, there may be a token refresh issue.
          </p>
        </div>
      </div>
    </div>
  );
}
