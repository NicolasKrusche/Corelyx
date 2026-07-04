import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import { Play, Clock, AlertCircle, CheckCircle } from "lucide-react";

type ActiveRunRow = {
  id: string;
  program_id: string;
  status: "running" | "pending";
  started_at: string | null;
  triggered_by: string;
  error_message: string | null;
};

async function getActiveRuns() {
  const db = createServiceClient();
  
  // Get running and pending runs
  const { data: runsRaw } = await db
    .from("runs")
    .select("id, program_id, status, started_at, triggered_by, error_message")
    .in("status", ["running", "pending"])
    .order("started_at", { ascending: false })
    .limit(50);

  const runs = (runsRaw ?? []) as ActiveRunRow[];
  const programIds = [...new Set(runs.map((run) => run.program_id))];

  const { data: programsRaw } = programIds.length > 0
    ? await db
        .from("programs")
        .select("id, user_id")
        .in("id", programIds)
    : { data: [] };

  const programs = (programsRaw ?? []) as Array<{ id: string; user_id: string }>;
  const programOwnerMap = new Map(programs.map((program) => [program.id, program.user_id]));
  
  // Get user info
  const userIds = [...new Set(programs.map((program) => program.user_id))];
  const { data: usersRaw } = userIds.length > 0
    ? await db
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds)
    : { data: [] };
  
  const users = (usersRaw ?? []) as Array<{ id: string; display_name: string | null }>;
  const userMap = new Map(users.map((user) => [user.id, user.display_name]));
  
  return runs.map((run) => {
    const userId = programOwnerMap.get(run.program_id);
    return {
    ...run,
    userDisplayName: userId ? userMap.get(userId) || userId.slice(0, 8) : "Unknown",
    duration: run.started_at 
      ? Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000)
      : 0,
    };
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default async function ActiveRunsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const runs = await getActiveRuns();
  
  const runningCount = runs.filter(r => r.status === "running").length;
  const pendingCount = runs.filter(r => r.status === "pending").length;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Active Runs</h1>
        <p className="text-muted-foreground">Monitor and manage running workflows</p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/15 rounded-full">
              <Play className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Running</p>
              <p className="text-2xl font-bold text-foreground">{runningCount}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-500/15 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-muted rounded-full">
              <CheckCircle className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Active</p>
              <p className="text-2xl font-bold text-foreground">{runs.length}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Runs Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Active Runs ({runs.length})
          </h2>
        </div>
        
        {runs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p>No active runs</p>
            <p className="text-sm">All workflows have completed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Run ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Trigger
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/40">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        run.status === "running"
                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                          : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                      }`}>
                        {run.status === "running" ? (
                          <Play className="w-3 h-3 mr-1" />
                        ) : (
                          <Clock className="w-3 h-3 mr-1" />
                        )}
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">
                      {run.id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {run.userDisplayName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                      {run.triggered_by}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {formatDuration(run.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {run.started_at ? new Date(run.started_at).toLocaleString() : "Not started"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Run Limits Warning */}
      {runningCount > 20 && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                High Load Warning
              </h3>
              <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                {runningCount} concurrent runs may indicate unusual load. 
                Monitor resource usage and consider scaling if this persists.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
