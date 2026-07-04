import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { Activity, AlertCircle, CheckCircle, XCircle, Zap } from "lucide-react";

export default async function CircuitBreakersPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");
  // Mock data - in production, fetch from runtime
  const circuits = [
    {
      name: "llm_proxy",
      state: "CLOSED",
      failureCount: 0,
      lastFailure: null,
      successCount: 1523,
    },
    {
      name: "oauth_token",
      state: "CLOSED",
      failureCount: 2,
      lastFailure: "2026-01-11T10:30:00Z",
      successCount: 892,
    },
    {
      name: "vault",
      state: "CLOSED",
      failureCount: 0,
      lastFailure: null,
      successCount: 450,
    },
  ];
  
  const getStateIcon = (state: string) => {
    switch (state) {
      case "CLOSED":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "OPEN":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "HALF_OPEN":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Activity className="w-5 h-5 text-muted-foreground" />;
    }
  };
  
  const getStateBadge = (state: string) => {
    const styles = {
      CLOSED: "bg-green-500/15 text-green-700 dark:text-green-300",
      OPEN: "bg-red-500/15 text-red-700 dark:text-red-300",
      HALF_OPEN: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[state as keyof typeof styles]}`}>
        {state.replace("_", "-")}
      </span>
    );
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Circuit Breakers</h1>
        <p className="text-muted-foreground">Monitor and manage circuit breaker states</p>
      </div>
      
      {/* Circuit Breaker Cards */}
      <div className="grid gap-4">
        {circuits.map((circuit) => (
          <div 
            key={circuit.name}
            className="bg-card rounded-lg shadow-sm border border-border p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStateIcon(circuit.state)}
                <div>
                  <h3 className="text-lg font-semibold text-foreground capitalize">
                    {circuit.name.replace("_", " ")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Protects against cascading failures
                  </p>
                </div>
              </div>
              {getStateBadge(circuit.state)}
            </div>
            
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Success Count</p>
                <p className="text-xl font-semibold text-foreground">
                  {circuit.successCount.toLocaleString()}
                </p>
              </div>
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Failure Count</p>
                <p className={`text-xl font-semibold ${
                  circuit.failureCount > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
                }`}>
                  {circuit.failureCount}
                </p>
              </div>
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-muted-foreground">Last Failure</p>
                <p className="text-sm text-foreground">
                  {circuit.lastFailure 
                    ? new Date(circuit.lastFailure).toLocaleString()
                    : "Never"
                  }
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* How It Works */}
      <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 p-6">
        <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          How Circuit Breakers Work
        </h3>
        <div className="space-y-3 text-sm text-blue-700 dark:text-blue-300">
          <p>
            <strong>CLOSED:</strong> Normal operation. Requests pass through.
          </p>
          <p>
            <strong>OPEN:</strong> Service failing. Requests are rejected immediately to prevent cascading failures.
          </p>
          <p>
            <strong>HALF-OPEN:</strong> Testing recovery. A limited number of test requests are allowed.
          </p>
          <div className="mt-4 pt-4 border-t border-blue-500/30">
            <p className="font-medium">Configuration:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Opens after 5 consecutive failures</li>
              <li>Stays open for 60 seconds minimum</li>
              <li>Allows 3 test calls in half-open state</li>
              <li>Closes after 3 consecutive successes</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Manual Reset */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Manual Reset</h3>
        <p className="text-sm text-muted-foreground mb-4">
          If a circuit breaker is stuck in OPEN state, you can manually reset it.
          Only do this if you&apos;re sure the underlying issue is resolved.
        </p>
        <button
          disabled
          className="px-4 py-2 bg-muted text-muted-foreground/60 rounded-lg cursor-not-allowed"
        >
          Reset All Circuits (Requires Runtime Access)
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Note: To reset circuits, restart the runtime service or use the Python console.
        </p>
      </div>
    </div>
  );
}
