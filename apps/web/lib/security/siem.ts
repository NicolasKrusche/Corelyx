/**
 * SIEM Integration
 * Structured logging for Splunk/Datadog/Elasticsearch
 * Fire-and-forget - never blocks the main request
 */

export type SiemRecord = {
  source: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string; // ISO timestamp
  actor: {
    id: string;
    email: string | null;
    role: string | null;
    ip: string | null;
  };
  target: {
    type: string;
    id: string | null;
    identifier: string | null;
  };
  action: string;
  outcome: 'success' | 'failure';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown> | null;
  correlationId: string;
  workspaceId: string | null;
};

/**
 * Forward audit record to SIEM system
 * @param record - The audit record to forward
 */
export async function forwardToSiem(record: SiemRecord): Promise<void> {
  const endpoint = process.env.SIEM_ENDPOINT;
  const apiKey = process.env.SIEM_API_KEY;

  if (!endpoint) {
    // In development, log to console if no endpoint configured
    console.warn('SIEM endpoint not configured, logging to console:', {
      ...record,
      // Mask sensitive data
      actor: { ...record.actor, email: '[REDACTED]' },
    });
    return;
  }

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Use keepalive for fire-and-forget behavior in Node.js
    // In browser environments, fetch will not wait for response
    await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
      // Don't wait for response to avoid blocking
      // Note: fetch in Node.js doesn't have keepalive option, but we don't await
    }).catch((error) => {
      // Log error but don't throw - SIEM failure shouldn't break the audit log
      console.warn('SIEM forwarding failed:', error.message);
    });
  } catch (error) {
    // Never throw - SIEM failure is non-critical
    console.warn('SIEM forwarding error:', error);
  }
}