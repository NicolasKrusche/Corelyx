import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  ToggleLeft,
  ToggleRight,
  Settings,
  AlertTriangle,
  Sparkles,
  Play,
  Shield
} from "lucide-react";

type FeatureFlagDisplay = {
  key: string;
  label: string;
  value: boolean | number;
  dangerous?: boolean;
  type?: "number";
};

export default async function FeatureFlagsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const flags = getFeatureFlags();
  
  const featureGroups: Array<{
    title: string;
    description: string;
    icon: typeof Shield;
    features: FeatureFlagDisplay[];
  }> = [
    {
      title: "Emergency Controls",
      description: "Kill switches for critical situations",
      icon: Shield,
      features: [
        { key: "emergencyMaintenanceMode", label: "Emergency Maintenance Mode", value: flags.emergencyMaintenanceMode, dangerous: true },
        { key: "disableGenesisGeneration", label: "Disable Genesis Generation", value: flags.disableGenesisGeneration, dangerous: true },
        { key: "disableWorkflowExecution", label: "Disable Workflow Execution", value: flags.disableWorkflowExecution, dangerous: true },
      ],
    },
    {
      title: "Feature Rollouts",
      description: "Gradual feature releases",
      icon: Sparkles,
      features: [
        { key: "enableNewConnectors", label: "Enable New Connectors", value: flags.enableNewConnectors },
        { key: "enableGenesisV2", label: "Enable Genesis V2", value: flags.enableGenesisV2 },
        { key: "enableAdvancedEditor", label: "Enable Advanced Editor", value: flags.enableAdvancedEditor },
        { key: "enableBulkOperations", label: "Enable Bulk Operations", value: flags.enableBulkOperations },
      ],
    },
    {
      title: "Safety Limits",
      description: "Resource protection settings",
      icon: Settings,
      features: [
        { key: "maxConcurrentRunsPerUser", label: "Max Concurrent Runs Per User", value: flags.maxConcurrentRunsPerUser, type: "number" },
        { key: "dailyRunQuotaPerUser", label: "Daily Run Quota Per User", value: flags.dailyRunQuotaPerUser, type: "number" },
      ],
    },
  ];
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Feature Flags</h1>
        <p className="text-muted-foreground">Manage feature toggles and system configuration</p>
      </div>
      
      {/* Environment Notice */}
      <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Environment-Based Configuration
            </h3>
            <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              The flags on this page are read-only environment variables — changing them
              requires updating the deployment environment and redeploying.
            </p>
            <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              The emergency controls (maintenance mode, disabling Genesis or workflow
              execution) are also DB-backed and can be toggled <strong>live, without a
              redeploy</strong>, on the{" "}
              <Link href="/admin/emergency" className="font-semibold underline">
                Emergency Controls page
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
      
      {/* Feature Groups */}
      <div className="space-y-6">
        {featureGroups.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.title} className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 bg-muted/40 border-b border-border">
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  </div>
                </div>
              </div>
              
              <div className="divide-y divide-border">
                {group.features.map((feature) => (
                  <div key={feature.key} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {feature.dangerous && (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                      <div>
                        <p className={`font-medium ${feature.dangerous ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>
                          {feature.label}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {feature.key}
                        </p>
                      </div>
                    </div>
                    
                    {feature.type === "number" ? (
                      <span className="text-2xl font-bold text-foreground">
                        {feature.value}
                      </span>
                    ) : feature.value ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <ToggleRight className="w-8 h-8" />
                        <span className="text-sm font-medium">ON</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60">
                        <ToggleLeft className="w-8 h-8" />
                        <span className="text-sm font-medium">OFF</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Environment Variables */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Environment Variables</h3>
        <pre className="text-sm text-green-400 overflow-x-auto">
{`# Emergency Controls
EMERGENCY_MAINTENANCE_MODE=${flags.emergencyMaintenanceMode}
DISABLE_GENESIS_GENERATION=${flags.disableGenesisGeneration}
DISABLE_WORKFLOW_EXECUTION=${flags.disableWorkflowExecution}

# Feature Rollouts
ENABLE_NEW_CONNECTORS=${flags.enableNewConnectors}
ENABLE_GENESIS_V2=${flags.enableGenesisV2}
ENABLE_ADVANCED_EDITOR=${flags.enableAdvancedEditor}
ENABLE_BULK_OPERATIONS=${flags.enableBulkOperations}

# Safety Limits
MAX_CONCURRENT_RUNS_PER_USER=${flags.maxConcurrentRunsPerUser}
DAILY_RUN_QUOTA_PER_USER=${flags.dailyRunQuotaPerUser}`}
        </pre>
      </div>
      
      {/* Instructions */}
      <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 p-6">
        <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">How to Update</h3>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-blue-700 dark:text-blue-300">
          <li>Update environment variables in Vercel dashboard or Railway</li>
          <li>For immediate changes, use the Emergency Controls page</li>
          <li>Redeploy to persist changes across restarts</li>
          <li>Monitor logs to verify changes took effect</li>
        </ol>
      </div>
    </div>
  );
}
