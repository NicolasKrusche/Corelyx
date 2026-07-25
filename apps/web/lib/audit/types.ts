/**
 * Admin Audit Log Types
 * Captures all administrative actions with risk levels for compliance and audit purposes
 */

export type AdminActionType =
  | 'admin.user.create'
  | 'admin.user.update'
  | 'admin.user.delete'
  | 'admin.user.suspend'
  | 'admin.user.unsuspend'
  | 'admin.user.role_change'
  | 'admin.workspace.create'
  | 'admin.workspace.update'
  | 'admin.workspace.delete'
  | 'admin.workspace.suspend'
  | 'admin.workspace.unsuspend'
  | 'admin.workspace.plan_change'
  | 'admin.workspace.credits_adjust'
  | 'admin.program.create'
  | 'admin.program.update'
  | 'admin.program.delete'
  | 'admin.program.approve'
  | 'admin.program.reject'
  | 'admin.program.suspend'
  | 'admin.connector.create'
  | 'admin.connector.update'
  'admin.connector.delete'
  | 'admin.connector.configure'
  | 'admin.connector.credentials.rotate'
  | 'admin.connector.credentials.revoke'
  | 'admin.billing.plan_change'
  | 'admin.billing.credit_grant'
  | 'admin.billing.refund'
  | 'admin.billing.invoice_override'
  | 'admin.billing.subscription_override'
  | 'admin.billing.webhook_retry'
  | 'admin.security.lock_apply'
  | 'admin.security.lock_release'
  | 'admin.security.credential_rotate'
  | 'admin.security.credential_revoke'
  | 'admin.security.audit_export'
  | 'admin.security.policy_override'
  | 'admin.security.siem_export'
  | 'admin.compliance.dpia_approve'
  | 'admin.compliance.dpia_reject'
  | 'admin.compliance.ropa_export'
  | 'admin.compliance.dsr_process'
  | 'admin.compliance.retention_override'
  | 'admin.system.maintenance_mode'
  | 'admin.system.feature_flag'
  | 'admin.system.migration_run'
  | 'admin.system.backup_trigger'
  | 'admin.system.backup_restore'
  | 'admin.integration.webhook_register'
  | 'admin.integration.webhook_delete'
  | 'admin.integration.webhook_retry'
  | 'admin.admin.create'
  | 'admin.admin.revoke'
  | 'admin.admin.role_change';

export type AdminRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AdminActionContext {
  // Actor performing the action
  actorId: string;
  actorEmail?: string;
  actorRole?: string;
  actorIp?: string;
  actorUserAgent?: string;

  // Target of the action
  targetType: 'user' | 'workspace' | 'program' | 'connector' | 'billing' | 'security' | 'compliance' | 'system' | 'integration' | 'admin';
  targetId: string;
  targetIdentifier?: string; // e.g., email, workspace slug, program name

  // Action details
  action: AdminActionType;
  riskLevel: AdminRiskLevel;
  reason?: string;
  metadata?: Record<string, unknown>;

  // Request context
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;

  // Outcome
  success: boolean;
  errorMessage?: string;
  affectedResources?: string[];

  // Compliance
  legalBasis?: 'legitimate_interest' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'consent';
  dataSubjectIds?: string[];
  retentionCategory?: 'audit_log' | 'security_log' | 'compliance_evidence' | 'operational_log';
  retentionDays?: number;
}

export interface AdminAuditRecord extends AdminActionContext {
  id: string;
  timestamp: string;
  workspaceId?: string;
  correlationId?: string;
  sessionId?: string;
}

export interface AdminAuditQuery {
  actorId?: string;
  targetType?: AdminActionContext['targetType'];
  targetId?: string;
  action?: AdminActionType;
  riskLevel?: AdminRiskLevel;
  success?: boolean;
  workspaceId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'riskLevel' | 'action';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminAuditExportOptions {
  format: 'json' | 'csv' | 'jsonl';
  query?: AdminAuditQuery;
  includeMetadata?: boolean;
  compress?: boolean;
}

export interface AdminRiskAssessment {
  action: AdminActionType;
  baseRisk: AdminRiskLevel;
  riskFactors: string[];
  mitigations: string[];
  requiresApproval: boolean;
  approvalRoles?: string[];
  retentionDays: number;
  siemExportRequired: boolean;
}

export const ADMIN_ACTION_RISK_MAP: Record<AdminActionType, AdminRiskAssessment> = {
  // User management
  'admin.user.create': { action: 'admin.user.create', baseRisk: 'medium', riskFactors: ['creates_user_account'], mitigations: ['admin_approval'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.user.update': { action: 'admin.user.update', baseRisk: 'low', riskFactors: ['modifies_user_data'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.user.delete': { action: 'admin.user.delete', baseRisk: 'high', riskFactors: ['deletes_user_data', 'gdpr_impact'], mitigations: ['gdpr_review', 'admin_approval'], requiresApproval: true, approvalRoles: ['founder', 'admin'], retentionDays: 2555, siemExportRequired: true },
  'admin.user.suspend': { action: 'admin.user.suspend', baseRisk: 'medium', riskFactors: ['suspends_access'], mitigations: ['audit_log', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.user.unsuspend': { action: 'admin.user.unsuspend', baseRisk: 'low', riskFactors: ['restores_access'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.user.role_change': { action: 'admin.user.role_change', baseRisk: 'high', riskFactors: ['privilege_escalation'], mitigations: ['dual_approval', 'audit_log'], requiresApproval: true, approvalRoles: ['founder'], retentionDays: 2555, siemExportRequired: true },

  // Workspace management
  'admin.workspace.create': { action: 'admin.workspace.create', baseRisk: 'low', riskFactors: ['creates_workspace'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.workspace.update': { action: 'admin.workspace.update', baseRisk: 'low', riskFactors: ['modifies_workspace'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.workspace.delete': { action: 'admin.workspace.delete', baseRisk: 'critical', riskFactors: ['deletes_workspace_data', 'gdpr_impact', 'data_loss'], mitigations: ['gdpr_review', 'dual_approval', 'backup_verification'], requiresApproval: true, approvalRoles: ['founder'], retentionDays: 2555, siemExportRequired: true },
  'admin.workspace.suspend': { action: 'admin.workspace.suspend', baseRisk: 'high', riskFactors: ['suspends_workspace'], mitigations: ['audit_log', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.workspace.unsuspend': { action: 'admin.workspace.unsuspend', baseRisk: 'low', riskFactors: ['restores_workspace'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.workspace.plan_change': { action: 'admin.workspace.plan_change', baseRisk: 'medium', riskFactors: ['billing_change'], mitigations: ['billing_audit', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.workspace.credits_adjust': { action: 'admin.workspace.credits_adjust', baseRisk: 'medium', riskFactors: ['billing_impact'], mitigations: ['billing_audit', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },

  // Program management
  'admin.program.create': { action: 'admin.program.create', baseRisk: 'low', riskFactors: ['creates_program'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.program.update': { action: 'admin.program.update', baseRisk: 'low', riskFactors: ['modifies_program'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.program.delete': { action: 'admin.program.delete', baseRisk: 'high', riskFactors: ['deletes_program', 'data_loss'], mitigations: ['audit_log', 'backup_verification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.program.approve': { action: 'admin.program.approve', baseRisk: 'medium', riskFactors: ['approves_ai_workflow'], mitigations: ['compliance_review', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.program.reject': { action: 'admin.program.reject', baseRisk: 'low', riskFactors: ['rejects_ai_workflow'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.program.suspend': { action: 'admin.program.suspend', baseRisk: 'medium', riskFactors: ['suspends_ai_workflow'], mitigations: ['audit_log', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },

  // Connector management
  'admin.connector.create': { action: 'admin.connector.create', baseRisk: 'medium', riskFactors: ['creates_integration', 'credential_handling'], mitigations: ['credential_audit', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.connector.update': { action: 'admin.connector.update', baseRisk: 'low', riskFactors: ['modifies_integration'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.connector.delete': { action: 'admin.connector.delete', baseRisk: 'medium', riskFactors: ['removes_integration', 'credential_revocation'], mitigations: ['credential_audit', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.connector.configure': { action: 'admin.connector.configure', baseRisk: 'medium', riskFactors: ['modifies_integration_config', 'credential_handling'], mitigations: ['credential_audit', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.connector.credentials.rotate': { action: 'admin.connector.credentials.rotate', baseRisk: 'high', riskFactors: ['credential_rotation', 'service_disruption_risk'], mitigations: ['credential_audit', 'rotation_audit', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.connector.credentials.revoke': { action: 'admin.connector.credentials.revoke', baseRisk: 'high', riskFactors: ['credential_revocation', 'service_disruption'], mitigations: ['credential_audit', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },

  // Billing
  'admin.billing.plan_change': { action: 'admin.billing.plan_change', baseRisk: 'medium', riskFactors: ['billing_change', 'revenue_impact'], mitigations: ['billing_audit', 'notification'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.billing.credit_grant': { action: 'admin.billing.credit_grant', baseRisk: 'medium', riskFactors: ['financial_impact', 'revenue_impact'], mitigations: ['billing_audit', 'dual_approval'], requiresApproval: true, approvalRoles: ['founder', 'finance'], retentionDays: 2555, siemExportRequired: true },
  'admin.billing.refund': { action: 'admin.billing.refund', baseRisk: 'high', riskFactors: ['financial_loss', 'revenue_impact', 'fraud_risk'], mitigations: ['billing_audit', 'dual_approval', 'fraud_check'], requiresApproval: true, approvalRoles: ['founder', 'finance'], retentionDays: 2555, siemExportRequired: true },
  'admin.billing.invoice_override': { action: 'admin.billing.invoice_override', baseRisk: 'high', riskFactors: ['billing_override', 'revenue_impact', 'audit_risk'], mitigations: ['billing_audit', 'dual_approval', 'audit_log'], requiresApproval: true, approvalRoles: ['founder', 'finance'], retentionDays: 2555, siemExportRequired: true },
  'admin.billing.subscription_override': { action: 'admin.billing.subscription_override', baseRisk: 'high', riskFactors: ['subscription_override', 'revenue_impact'], mitigations: ['billing_audit', 'dual_approval'], requiresApproval: true, approvalRoles: ['founder', 'finance'], retentionDays: 2555, siemExportRequired: true },
  'admin.billing.webhook_retry': { action: 'admin.billing.webhook_retry', baseRisk: 'low', riskFactors: ['webhook_retry'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },

  // Security
  'admin.security.lock_apply': { action: 'admin.security.lock_apply', baseRisk: 'high', riskFactors: ['security_lock', 'access_denial'], mitigations: ['security_audit', 'dual_approval', 'time_limit'], requiresApproval: true, approvalRoles: ['founder', 'security'], retentionDays: 2555, siemExportRequired: true },
  'admin.security.lock_release': { action: 'admin.security.lock_release', baseRisk: 'medium', riskFactors: ['security_lock_release', 'access_restoration'], mitigations: ['security_audit', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.security.credential_rotate': { action: 'admin.security.credential_rotate', baseRisk: 'critical', riskFactors: ['credential_rotation', 'system_wide_impact'], mitigations: ['credential_audit', 'rotation_audit', 'notification', 'rollback_plan'], requiresApproval: true, approvalRoles: ['founder', 'security'], retentionDays: 2555, siemExportRequired: true },
  'admin.security.credential_revoke': { action: 'admin.security.credential_revoke', baseRisk: 'critical', riskFactors: ['credential_revocation', 'system_wide_impact', 'service_disruption'], mitigations: ['credential_audit', 'notification', 'rollback_plan'], requiresApproval: true, approvalRoles: ['founder', 'security'], retentionDays: 2555, siemExportRequired: true },
  'admin.security.audit_export': { action: 'admin.security.audit_export', baseRisk: 'medium', riskFactors: ['audit_data_export', 'data_exposure_risk'], mitigations: ['access_control', 'audit_log', 'encryption'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.security.policy_override': { action: 'admin.security.policy_override', baseRisk: 'critical', riskFactors: ['policy_override', 'security_control_bypass'], mitigations: ['dual_approval', 'security_audit', 'time_limit', 'audit_log'], requiresApproval: true, approvalRoles: ['founder', 'security'], retentionDays: 2555, siemExportRequired: true },
  'admin.security.siem_export': { action: 'admin.security.siem_export', baseRisk: 'medium', riskFactors: ['security_data_export', 'data_exposure_risk'], mitigations: ['access_control', 'audit_log', 'encryption'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },

  // Compliance
  'admin.compliance.dpia_approve': { action: 'admin.compliance.dpia_approve', baseRisk: 'high', riskFactors: ['dpia_approval', 'gdpr_impact'], mitigations: ['dpo_approval', 'audit_log', 'retention_policy'], requiresApproval: true, approvalRoles: ['dpo', 'founder'], retentionDays: 2555, siemExportRequired: true },
  'admin.compliance.dpia_reject': { action: 'admin.compliance.dpia_reject', baseRisk: 'medium', riskFactors: ['dpia_rejection', 'compliance_risk'], mitigations: ['dpo_review', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.compliance.ropa_export': { action: 'admin.compliance.ropa_export', baseRisk: 'medium', riskFactors: ['ropa_export', 'data_exposure_risk'], mitigations: ['access_control', 'audit_log', 'encryption'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.compliance.dsr_process': { action: 'admin.compliance.dsr_process', baseRisk: 'high', riskFactors: ['dsr_processing', 'gdpr_obligation', 'data_subject_rights'], mitigations: ['dpo_approval', 'audit_log', 'verification', 'timeline_tracking'], requiresApproval: true, approvalRoles: ['dpo'], retentionDays: 2555, siemExportRequired: true },
  'admin.compliance.retention_override': { action: 'admin.compliance.retention_override', baseRisk: 'critical', riskFactors: ['retention_override', 'gdpr_violation_risk', 'legal_risk'], mitigations: ['dpo_approval', 'legal_review', 'audit_log', 'documentation'], requiresApproval: true, approvalRoles: ['dpo', 'legal', 'founder'], retentionDays: 2555, siemExportRequired: true },

  // System
  'admin.system.maintenance_mode': { action: 'admin.system.maintenance_mode', baseRisk: 'high', riskFactors: ['maintenance_mode', 'service_disruption', 'all_users_affected'], mitigations: ['maintenance_window', 'notification', 'rollback_plan', 'audit_log'], requiresApproval: true, approvalRoles: ['founder', 'dev'], retentionDays: 2555, siemExportRequired: true },
  'admin.system.feature_flag': { action: 'admin.system.feature_flag', baseRisk: 'medium', riskFactors: ['feature_flag_change', 'behavior_change'], mitigations: ['feature_flag_audit', 'gradual_rollout', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.system.migration_run': { action: 'admin.system.migration_run', baseRisk: 'critical', riskFactors: ['database_migration', 'data_integrity_risk', 'downtime_risk'], mitigations: ['migration_plan', 'backup_verification', 'rollback_plan', 'dev_approval', 'audit_log'], requiresApproval: true, approvalRoles: ['founder', 'dev'], retentionDays: 2555, siemExportRequired: true },
  'admin.system.backup_trigger': { action: 'admin.system.backup_trigger', baseRisk: 'medium', riskFactors: ['backup_trigger', 'resource_usage'], mitigations: ['backup_verification', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: true },
  'admin.system.backup_restore': { action: 'admin.system.backup_restore', baseRisk: 'critical', riskFactors: ['backup_restore', 'data_overwrite_risk', 'data_loss_risk'], mitigations: ['backup_verification', 'dev_approval', 'staging_test', 'audit_log', 'rollback_plan'], requiresApproval: true, approvalRoles: ['founder', 'dev'], retentionDays: 2555, siemExportRequired: true },

  // Integration
  'admin.integration.webhook_register': { action: 'admin.integration.webhook_register', baseRisk: 'medium', riskFactors: ['webhook_registration', 'external_callback'], mitigations: ['webhook_verification', 'audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.integration.webhook_delete': { action: 'admin.integration.webhook_delete', baseRisk: 'low', riskFactors: ['webhook_removal'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },
  'admin.integration.webhook_retry': { action: 'admin.integration.webhook_retry', baseRisk: 'low', riskFactors: ['webhook_retry'], mitigations: ['audit_log'], requiresApproval: false, retentionDays: 2555, siemExportRequired: false },

  // Admin management
  'admin.admin.create': { action: 'admin.admin.create', baseRisk: 'critical', riskFactors: ['admin_creation', 'privilege_escalation'], mitigations: ['founder_approval', 'audit_log', 'notification'], requiresApproval: true, approvalRoles: ['founder'], retentionDays: 2555, siemExportRequired: true },
  'admin.admin.revoke': { action: 'admin.admin.revoke', baseRisk: 'critical', riskFactors: ['admin_revocation', 'privilege_revocation'], mitigations: ['founder_approval', 'audit_log', 'notification'], requiresApproval: true, approvalRoles: ['founder'], retentionDays: 2555, siemExportRequired: true },
  'admin.admin.role_change': { action: 'admin.admin.role_change', baseRisk: 'critical', riskFactors: ['admin_role_change', 'privilege_change'], mitigations: ['founder_approval', 'audit_log', 'notification'], requiresApproval: true, approvalRoles: ['founder'], retentionDays: 2555, siemExportRequired: true },
} as const;