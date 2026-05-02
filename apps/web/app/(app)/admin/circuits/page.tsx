import { Activity, AlertCircle, CheckCircle, XCircle, Zap } from "lucide-react";

// This would ideally fetch from the runtime API
// For now, showing the structure

export default function CircuitBreakersPage() {
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
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };
  
  const getStateBadge = (state: string) => {
    const styles = {
      CLOSED: "bg-green-100 text-green-800",
      OPEN: "bg-red-100 text-red-800",
      HALF_OPEN: "bg-yellow-100 text-yellow-800",
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
        <h1 className="text-2xl font-bold text-gray-900">Circuit Breakers</h1>
        <p className="text-gray-600">Monitor and manage circuit breaker states</p>
      </div>
      
      {/* Circuit Breaker Cards */}
      <div className="grid gap-4">
        {circuits.map((circuit) => (
          <div 
            key={circuit.name}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStateIcon(circuit.state)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 capitalize">
                    {circuit.name.replace("_", " ")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Protects against cascading failures
                  </p>
                </div>
              </div>
              {getStateBadge(circuit.state)}
            </div>
            
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-gray-500">Success Count</p>
                <p className="text-xl font-semibold text-gray-900">
                  {circuit.successCount.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-gray-500">Failure Count</p>
                <p className={`text-xl font-semibold ${
                  circuit.failureCount > 0 ? "text-red-600" : "text-gray-900"
                }`}>
                  {circuit.failureCount}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-gray-500">Last Failure</p>
                <p className="text-sm text-gray-900">
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
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          How Circuit Breakers Work
        </h3>
        <div className="space-y-3 text-sm text-blue-800">
          <p>
            <strong>CLOSED:</strong> Normal operation. Requests pass through.
          </p>
          <p>
            <strong>OPEN:</strong> Service failing. Requests are rejected immediately to prevent cascading failures.
          </p>
          <p>
            <strong>HALF-OPEN:</strong> Testing recovery. A limited number of test requests are allowed.
          </p>
          <div className="mt-4 pt-4 border-t border-blue-200">
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Manual Reset</h3>
        <p className="text-sm text-gray-600 mb-4">
          If a circuit breaker is stuck in OPEN state, you can manually reset it.
          Only do this if you&apos;re sure the underlying issue is resolved.
        </p>
        <button
          disabled
          className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
        >
          Reset All Circuits (Requires Runtime Access)
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Note: To reset circuits, restart the runtime service or use the Python console.
        </p>
      </div>
    </div>
  );
}
