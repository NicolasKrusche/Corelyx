import { revalidatePath } from "next/cache";
import { AlertTriangle, Power, Shield, AlertCircle } from "lucide-react";

async function getCurrentStatus() {
  return {
    maintenanceMode: process.env.EMERGENCY_MAINTENANCE_MODE === "true",
    disableGenesis: process.env.DISABLE_GENESIS_GENERATION === "true",
    disableExecution: process.env.DISABLE_WORKFLOW_EXECUTION === "true",
  };
}

async function updateFeatureFlag(key: string, value: boolean) {
  "use server";
  
  // In production, this would update via Vercel API or similar
  // For now, we'll just set the env var for the current process
  process.env[key] = value ? "true" : "false";
  
  revalidatePath("/admin/emergency");
}

export default async function EmergencyControlsPage() {
  const status = await getCurrentStatus();
  
  const anyActive = status.maintenanceMode || status.disableGenesis || status.disableExecution;
  
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Emergency Controls</h1>
        <p className="text-gray-600">Kill switches and emergency stops</p>
      </div>
      
      {/* Emergency Banner */}
      {anyActive && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Emergency Mode Active
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc pl-5 space-y-1">
                  {status.maintenanceMode && (
                    <li>Full maintenance mode - all API requests blocked</li>
                  )}
                  {status.disableGenesis && (
                    <li>Genesis generation disabled</li>
                  )}
                  {status.disableExecution && (
                    <li>Workflow execution disabled</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Emergency Stop - Big Red Button */}
      <div className="bg-white rounded-lg shadow-sm border-2 border-red-200 overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
            <Power className="w-5 h-5" />
            EMERGENCY STOP
          </h2>
        </div>
        <div className="p-6">
          <p className="text-gray-700 mb-4">
            Immediately stops all non-essential services. Use this during:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-600 mb-6 space-y-1">
            <li>Security breaches</li>
            <li>Data corruption incidents</li>
            <li>Runaway costs</li>
            <li>Cascading failures</li>
          </ul>
          
          <div className="flex gap-4">
            <form action={async () => {
              "use server";
              await updateFeatureFlag("EMERGENCY_MAINTENANCE_MODE", true);
            }}>
              <button
                type="submit"
                disabled={status.maintenanceMode}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  status.maintenanceMode
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                <Power className="w-5 h-5" />
                {status.maintenanceMode ? "Already Active" : "ACTIVATE EMERGENCY STOP"}
              </button>
            </form>
            
            {status.maintenanceMode && (
              <form action={async () => {
                "use server";
                await updateFeatureFlag("EMERGENCY_MAINTENANCE_MODE", false);
              }}>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
                >
                  <Shield className="w-5 h-5" />
                  RESUME NORMAL OPERATIONS
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      
      {/* Feature-Specific Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Genesis Control */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Genesis Generation</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status.disableGenesis 
                  ? "bg-red-100 text-red-800" 
                  : "bg-green-100 text-green-800"
              }`}>
                {status.disableGenesis ? "DISABLED" : "ENABLED"}
              </span>
            </div>
            
            <form action={async () => {
              "use server";
              await updateFeatureFlag("DISABLE_GENESIS_GENERATION", !status.disableGenesis);
            }}>
              <button
                type="submit"
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  status.disableGenesis
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                {status.disableGenesis ? "Enable Genesis" : "Disable Genesis"}
              </button>
            </form>
          </div>
        </div>
        
        {/* Workflow Execution Control */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Workflow Execution</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status.disableExecution 
                  ? "bg-red-100 text-red-800" 
                  : "bg-green-100 text-green-800"
              }`}>
                {status.disableExecution ? "DISABLED" : "ENABLED"}
              </span>
            </div>
            
            <form action={async () => {
              "use server";
              await updateFeatureFlag("DISABLE_WORKFLOW_EXECUTION", !status.disableExecution);
            }}>
              <button
                type="submit"
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  status.disableExecution
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                {status.disableExecution ? "Enable Execution" : "Disable Execution"}
              </button>
            </form>
          </div>
        </div>
      </div>
      
      {/* Manual Overrides */}
      <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Manual Override Instructions
        </h3>
        <div className="text-sm text-yellow-800 space-y-2">
          <p>
            If the dashboard controls fail, you can manually set environment variables:
          </p>
          <pre className="bg-yellow-100 p-3 rounded mt-2 overflow-x-auto">
{`# Emergency stop everything
EMERGENCY_MAINTENANCE_MODE=true

# Disable specific features
DISABLE_GENESIS_GENERATION=true
DISABLE_WORKFLOW_EXECUTION=true

# Reset circuit breakers
# (Requires runtime restart or API call)`}
          </pre>
          <p className="mt-2">
            Then restart the web and runtime services.
          </p>
        </div>
      </div>
    </div>
  );
}
