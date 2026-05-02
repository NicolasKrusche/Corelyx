import { createServiceClient } from "@/lib/api";
import { Lock, Unlock, Clock } from "lucide-react";

async function getActiveLocks() {
  const db = createServiceClient();
  
  const { data: locks } = await db
    .from("credential_locks")
    .select("lock_key, lock_id, created_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  
  return locks || [];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default async function CredentialLocksPage() {
  const locks = await getActiveLocks();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Credential Locks</h1>
        <p className="text-gray-600">
          Active distributed locks for OAuth token refresh
        </p>
      </div>
      
      {/* Stats */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-full ${
            locks.length > 0 ? "bg-blue-100" : "bg-green-100"
          }`}>
            {locks.length > 0 ? (
              <Lock className="w-6 h-6 text-blue-600" />
            ) : (
              <Unlock className="w-6 h-6 text-green-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Active Locks</p>
            <p className="text-2xl font-bold text-gray-900">{locks.length}</p>
          </div>
        </div>
      </div>
      
      {/* Locks Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Active Credential Locks
          </h2>
        </div>
        
        {locks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Unlock className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p>No active locks</p>
            <p className="text-sm">All credential operations are available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lock Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lock ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires In
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {locks.map((lock) => {
                  const expiresIn = Math.floor(
                    (new Date(lock.expires_at).getTime() - Date.now()) / 1000
                  );
                  
                  return (
                    <tr key={lock.lock_key} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {lock.lock_key}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {lock.lock_id.slice(0, 16)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(lock.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          About Credential Locks
        </h3>
        <div className="space-y-2 text-sm text-blue-800">
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
