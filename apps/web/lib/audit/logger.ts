/**
 * Admin Audit Logger
 * Captures all administrative actions with risk levels for compliance and audit purposes
 * Writes to append-only audit_logs table via SECURITY DEFINER RPC
 */

import { createServiceClient } from '@/lib/api';
import { serverLog } from '@/lib/server-log';
import type {
  AdminActionContext,
  AdminActionType,
  AdminRiskLevel,
  AdminAuditRecord,
  AdminAuditQuery,
  AdminAuditExportOptions,
  AdminRiskAssessment,
} from '@/lib/audit/types';
// A value, not a type — it must be a runtime import or assessAdminRisk below
// throws at module load.
import { ADMIN_ACTION_RISK_MAP } from '@/lib/audit/types';

type ServiceDb = ReturnType<typeof createServiceClient> & { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };

function db(): ServiceDb {
  return createServiceClient() as unknown as ServiceDb;
}

/**
 * Get risk assessment for an admin action
 */
export function assessAdminRisk(action: AdminActionType): AdminRiskAssessment {
  return ADMIN_ACTION_RISK_MAP[action] ?? {
    action,
    baseRisk: 'medium' as AdminRiskLevel,
    riskFactors: ['unknown_action'],
    mitigations: ['audit_log'],
    requiresApproval: false,
    retentionDays: 2555,
    siemExportRequired: true,
  };
}

/**
 * Determine risk level based on action and context
 */
export function calculateRiskLevel(
  action: AdminActionType,
  context: Partial<AdminActionContext>
): AdminRiskLevel {
  const assessment = assessAdminRisk(action);
  let risk = assessment.baseRisk;

  // Escalate risk based on context
  if (context.targetType === 'workspace' && context.action?.includes('delete')) {
    risk = 'critical';
  }
  if (context.targetType === 'admin' && context.action?.includes('create')) {
    risk = 'critical';
  }
  if (context.actorRole === 'founder' && assessment.baseRisk === 'critical') {
    // Founder actions at critical level still need dual approval
    risk = 'critical';
  }
  if (!context.success) {
    // Failed critical/high actions are higher risk (potential attack)
    if (risk === 'critical' || risk === 'high') {
      risk = 'critical';
    }
  }

  return risk;
}

/**
 * Record an administrative action to the audit log
 * Never throws - audit logging must not break the request path
 */
export async function recordAdminAction(
  context: AdminActionContext
): Promise<{ success: boolean; auditId?: string; error?: string }> {
  const startTime = Date.now();
  const auditId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    // Assess risk level
    const riskLevel = calculateRiskLevel(context.action, context);

    // Prepare audit record
    const record = {
      id: auditId,
      timestamp,
      ...context,
      riskLevel,
      workspaceId: context.workspaceId ?? null,
      correlationId: context.correlationId ?? crypto.randomUUID(),
      sessionId: context.sessionId ?? null,
      legalBasis: context.legalBasis ?? 'legitimate_interest',
      dataSubjectIds: context.dataSubjectIds ?? [],
      retentionCategory: context.retentionCategory ?? 'audit_log',
      retentionDays: context.retentionDays ?? assessAdminRisk(context.action).retentionDays,
    };

    // Write to database via RPC (SECURITY DEFINER)
    const service = db();
    const { data, error } = await service.rpc('record_admin_audit_log', {
      p_id: record.id,
      p_timestamp: record.timestamp,
      p_actor_id: record.actorId,
      p_actor_email: record.actorEmail ?? null,
      p_actor_role: record.actorRole ?? null,
      p_actor_ip: record.actorIp ?? null,
      p_actor_user_agent: record.actorUserAgent ?? null,
      p_target_type: record.targetType,
      p_target_id: record.targetId,
      p_target_identifier: record.targetIdentifier ?? null,
      p_action: record.action,
      p_risk_level: record.riskLevel,
      p_reason: record.reason ?? null,
      p_metadata: record.metadata ?? null,
      p_request_id: record.requestId ?? null,
      p_ip_address: record.ipAddress ?? null,
      p_user_agent: record.userAgent ?? null,
      p_referer: record.referer ?? null,
      p_success: record.success,
      p_error_message: record.errorMessage ?? null,
      p_affected_resources: record.affectedResources ?? null,
      p_legal_basis: record.legalBasis,
      p_data_subject_ids: record.dataSubjectIds ?? null,
      p_retention_category: record.retentionCategory,
      p_retention_days: record.retentionDays,
      p_workspace_id: record.workspaceId,
      p_correlation_id: record.correlationId,
      p_session_id: record.sessionId,
    });

    if (error) {
      serverLog({
        level: 'error',
        event: 'admin_audit.record_failed',
        message: 'Failed to record admin audit log',
        details: { action: context.action, targetType: context.targetType, error: error.message },
      });
      return { success: false, error: error.message };
    }

    const duration = Date.now() - startTime;

    // Also log to server log for operational visibility
    serverLog({
      level: riskLevel === 'critical' || riskLevel === 'high' ? 'error' : 'info',
      event: 'admin_audit.recorded',
      message: `Admin action recorded: ${context.action}`,
      details: {
        auditId,
        action: context.action,
        targetType: context.targetType,
        targetId: context.targetId,
        riskLevel,
        success: context.success,
        durationMs: duration,
      },
    });

    // If high/critical risk or SIEM export required, also forward to SIEM
    const assessment = assessAdminRisk(context.action);
    if (assessment.siemExportRequired || riskLevel === 'high' || riskLevel === 'critical') {
      // Fire and forget - don't block on SIEM
      forwardToSiem(record as AdminAuditRecord).catch(() => {});
    }

    return { success: true, auditId };
  } catch (err) {
    const duration = Date.now() - startTime;
    serverLog({
      level: 'error',
      event: 'admin_audit.record_threw',
      message: 'Admin audit logging threw an exception',
      details: {
        action: context.action,
        targetType: context.targetType,
        error: err instanceof Error ? err.message : String(err),
        durationMs: duration,
      },
    });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Forward audit record to SIEM integration
 * Fire-and-forget - never blocks the main request
 */
async function forwardToSiem(record: AdminAuditRecord): Promise<void> {
  try {
    const { forwardToSiem } = await import('@/lib/security/siem');
    await forwardToSiem({
      source: 'admin_audit',
      eventType: record.action,
      severity: mapRiskToSiemSeverity(record.riskLevel),
      timestamp: record.timestamp,
      // SiemRecord uses `| null` for absent values, so coalesce rather than
      // passing `undefined` through — JSON.stringify would drop those keys
      // entirely and the SIEM would see a differently-shaped event.
      actor: {
        id: record.actorId,
        email: record.actorEmail ?? null,
        role: record.actorRole ?? null,
        ip: record.actorIp ?? null,
      },
      target: {
        type: record.targetType,
        id: record.targetId,
        identifier: record.targetIdentifier ?? null,
      },
      action: record.action,
      outcome: record.success ? 'success' : 'failure',
      riskLevel: record.riskLevel,
      details: record.metadata ?? null,
      correlationId: record.correlationId,
      workspaceId: record.workspaceId ?? null,
    });
  } catch {
    // SIEM forward failure is logged but doesn't block
    serverLog({
      level: 'warn',
      event: 'admin_audit.siem_forward_failed',
      message: 'Failed to forward admin audit to SIEM',
      details: { auditId: record.id, action: record.action },
    });
  }
}

/**
 * Map internal risk levels to SIEM severity levels
 */
function mapRiskToSiemSeverity(risk: AdminRiskLevel): 'low' | 'medium' | 'high' | 'critical' {
  switch (risk) {
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    case 'critical': return 'critical';
  }
}

/**
 * Query admin audit logs with filtering and pagination
 */
export async function queryAdminAuditLogs(
  query: AdminAuditQuery
): Promise<{ records: AdminAuditRecord[]; total: number; hasMore: boolean }> {
  try {
    const service = db();
    let q = service.from('admin_audit_logs').select('*', { count: 'exact' });

    // Apply filters
    if (query.actorId) q = q.eq('actor_id', query.actorId);
    if (query.targetType) q = q.eq('target_type', query.targetType);
    if (query.targetId) q = q.eq('target_id', query.targetId);
    if (query.action) q = q.eq('action', query.action);
    if (query.riskLevel) q = q.eq('risk_level', query.riskLevel);
    if (query.success !== undefined) q = q.eq('success', query.success);
    if (query.workspaceId) q = q.eq('workspace_id', query.workspaceId);
    if (query.dateFrom) q = q.gte('timestamp', query.dateFrom);
    if (query.dateTo) q = q.lte('timestamp', query.dateTo);

    // Sorting
    const sortBy = query.sortBy ?? 'timestamp';
    const sortOrder = query.sortOrder ?? 'desc';
    q = q.order(sortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    const limit = Math.min(query.limit ?? 100, 500);
    const offset = query.offset ?? 0;
    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;

    if (error) {
      throw new Error(`Failed to query admin audit logs: ${error.message}`);
    }

    return {
      records: (data ?? []) as unknown as AdminAuditRecord[],
      total: count ?? 0,
      hasMore: (count ?? 0) > offset + limit,
    };
  } catch (err) {
    serverLog({
      level: 'error',
      event: 'admin_audit.query_failed',
      message: 'Failed to query admin audit logs',
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return { records: [], total: 0, hasMore: false };
  }
}

/**
 * Export admin audit logs in various formats
 */
export async function exportAdminAuditLogs(
  options: AdminAuditExportOptions
): Promise<{ data: string; filename: string; contentType: string } | { error: string }> {
  try {
    const { records, total } = await queryAdminAuditLogs({
      ...options.query,
      limit: options.query?.limit ?? 10000,
    });

    if (records.length === 0) {
      return { error: 'No records found for export' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `admin-audit-export-${timestamp}`;

    switch (options.format) {
      case 'json': {
        const data = JSON.stringify(
          options.includeMetadata
            ? { exportedAt: new Date().toISOString(), totalRecords: total, records }
            : records,
          null,
          2
        );
        return {
          data,
          filename: `${baseFilename}.json`,
          contentType: 'application/json',
        };
      }
      case 'jsonl': {
        const data = records.map((r) => JSON.stringify(r)).join('\n');
        return {
          data,
          filename: `${baseFilename}.jsonl`,
          contentType: 'application/jsonl',
        };
      }
      case 'csv': {
        const { toCsv } = await import('@/lib/compliance/export');
        // toCsv takes (headers, rows) — it was being called with the record
        // array alone, so CSV export could never have produced valid output.
        // Columns are listed explicitly so the export stays stable if the
        // record shape gains fields.
        const columns = [
          'id', 'timestamp', 'action', 'riskLevel', 'success',
          'actorId', 'actorEmail', 'actorRole', 'actorIp',
          'targetType', 'targetId', 'targetIdentifier',
          'workspaceId', 'correlationId', 'sessionId',
          'reason', 'errorMessage', 'legalBasis', 'retentionCategory',
        ] as const;
        const data = toCsv(
          [...columns],
          records.map((r) => columns.map((c) => r[c] ?? '')),
        );
        return {
          data,
          filename: `${baseFilename}.csv`,
          contentType: 'text/csv',
        };
      }
      default:
        return { error: `Unsupported export format: ${options.format}` };
    }
  } catch (err) {
    serverLog({
      level: 'error',
      event: 'admin_audit.export_failed',
      message: 'Failed to export admin audit logs',
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return { error: err instanceof Error ? err.message : 'Export failed' };
  }
}

/**
 * Get risk statistics for admin dashboard
 */
export async function getAdminRiskStats(
  workspaceId?: string,
  days = 30
): Promise<{
  totalActions: number;
  byRiskLevel: Record<AdminRiskLevel, number>;
  byAction: Record<string, number>;
  failedActions: number;
  criticalActions: number;
  topActors: Array<{ actorId: string; count: number; maxRisk: AdminRiskLevel }>;
}> {
  try {
    const service = db();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let q = service
      .from('admin_audit_logs')
      .select('risk_level, action, success, actor_id')
      .gte('timestamp', since);

    if (workspaceId) {
      q = q.eq('workspace_id', workspaceId);
    }

    const { data, error } = await q.limit(10000);

    if (error) throw new Error(error.message);

    const records = (data ?? []) as Array<{
      risk_level: AdminRiskLevel;
      action: string;
      success: boolean;
      actor_id: string;
    }>;

    const byRiskLevel: Record<AdminRiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byAction: Record<string, number> = {};
    const actorStats: Record<string, { count: number; maxRisk: AdminRiskLevel }> = {};

    let failedActions = 0;
    let criticalActions = 0;

    for (const r of records) {
      byRiskLevel[r.risk_level] = (byRiskLevel[r.risk_level] ?? 0) + 1;
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      if (!r.success) failedActions++;
      if (r.risk_level === 'critical') criticalActions++;

      const actor = actorStats[r.actor_id] ?? { count: 0, maxRisk: 'low' as AdminRiskLevel };
      actor.count++;
      const riskOrder: AdminRiskLevel[] = ['low', 'medium', 'high', 'critical'];
      if (riskOrder.indexOf(r.risk_level) > riskOrder.indexOf(actor.maxRisk)) {
        actor.maxRisk = r.risk_level;
      }
      actorStats[r.actor_id] = actor;
    }

    const topActors = Object.entries(actorStats)
      .map(([actorId, stats]) => ({ actorId, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalActions: records.length,
      byRiskLevel,
      byAction,
      failedActions,
      criticalActions,
      topActors,
    };
  } catch (err) {
    serverLog({
      level: 'error',
      event: 'admin_audit.stats_failed',
      message: 'Failed to compute admin risk stats',
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return {
      totalActions: 0,
      byRiskLevel: { low: 0, medium: 0, high: 0, critical: 0 },
      byAction: {},
      failedActions: 0,
      criticalActions: 0,
      topActors: [],
    };
  }
}

/**
 * Middleware helper to record admin actions from API routes
 */
export function createAdminAuditMiddleware(
  getActor: () => Promise<{ id: string; email?: string; role?: string } | null>,
  getRequestContext: () => { requestId?: string; ip?: string; userAgent?: string; referer?: string }
) {
  return async function auditAdminAction(
    action: AdminActionType,
    target: { type: AdminActionContext['targetType']; id: string; identifier?: string },
    options: {
      reason?: string;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      affectedResources?: string[];
      workspaceId?: string;
      legalBasis?: AdminActionContext['legalBasis'];
      dataSubjectIds?: string[];
      retentionCategory?: AdminActionContext['retentionCategory'];
      retentionDays?: number;
    } = {}
  ) {
    const actor = await getActor();
    const reqCtx = getRequestContext();

    if (!actor) {
      serverLog({
        level: 'warn',
        event: 'admin_audit.no_actor',
        message: 'Admin audit attempted without authenticated actor',
        details: { action, targetType: target.type, targetId: target.id },
      });
      return { success: false, error: 'No authenticated actor' };
    }

    return recordAdminAction({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      actorIp: reqCtx.ip,
      actorUserAgent: reqCtx.userAgent,
      targetType: target.type,
      targetId: target.id,
      targetIdentifier: target.identifier,
      action,
      riskLevel: 'medium', // Will be recalculated
      reason: options.reason,
      metadata: options.metadata,
      requestId: reqCtx.requestId,
      ipAddress: reqCtx.ip,
      userAgent: reqCtx.userAgent,
      referer: reqCtx.referer,
      success: options.success ?? true,
      errorMessage: options.errorMessage,
      affectedResources: options.affectedResources,
      workspaceId: options.workspaceId,
      legalBasis: options.legalBasis,
      dataSubjectIds: options.dataSubjectIds,
      retentionCategory: options.retentionCategory,
      retentionDays: options.retentionDays,
    });
  };
}

// Re-export types for convenience
export type { AdminRiskAssessment } from '@/lib/audit/types';
export { ADMIN_ACTION_RISK_MAP } from '@/lib/audit/types';