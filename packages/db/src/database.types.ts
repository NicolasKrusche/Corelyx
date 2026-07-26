// Auto-generated from the deployed Supabase PostgREST OpenAPI schema.
// Run pnpm --filter @flowos/db gen:types:rest after applying migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      "account_deletion_audit": {
        Row: {
          "id": string;
          "deleted_user_id": string;
          "email_sha256": string | null;
          "requested_at": string;
          "completed_at": string | null;
          "status": string;
          "vault_secrets_seen": number;
          "vault_secrets_deleted": number;
          "stripe_customers_seen": number;
          "stripe_subscriptions_cancelled": number;
          "resend_contact_deleted": boolean;
          "auth_user_deleted": boolean;
          "errors": Json;
          "created_at": string;
          "storage_objects_seen": number;
          "storage_objects_deleted": number;
        };
        Insert: {
          "id"?: string;
          "deleted_user_id": string;
          "email_sha256"?: string | null;
          "requested_at"?: string;
          "completed_at"?: string | null;
          "status"?: string;
          "vault_secrets_seen"?: number;
          "vault_secrets_deleted"?: number;
          "stripe_customers_seen"?: number;
          "stripe_subscriptions_cancelled"?: number;
          "resend_contact_deleted"?: boolean;
          "auth_user_deleted"?: boolean;
          "errors": Json;
          "created_at"?: string;
          "storage_objects_seen"?: number;
          "storage_objects_deleted"?: number;
        };
        Update: {
          "id"?: string;
          "deleted_user_id"?: string;
          "email_sha256"?: string | null;
          "requested_at"?: string;
          "completed_at"?: string | null;
          "status"?: string;
          "vault_secrets_seen"?: number;
          "vault_secrets_deleted"?: number;
          "stripe_customers_seen"?: number;
          "stripe_subscriptions_cancelled"?: number;
          "resend_contact_deleted"?: boolean;
          "auth_user_deleted"?: boolean;
          "errors"?: Json;
          "created_at"?: string;
          "storage_objects_seen"?: number;
          "storage_objects_deleted"?: number;
        };
        Relationships: [];
      };
      "admin_audit_logs": {
        Row: {
          "id": string;
          "timestamp": string;
          "actor_id": string;
          "actor_email": string | null;
          "actor_role": string | null;
          "actor_ip": string | null;
          "actor_user_agent": string | null;
          "target_type": string;
          "target_id": string;
          "target_identifier": string | null;
          "action": string;
          "risk_level": string;
          "reason": string | null;
          "metadata": Json | null;
          "request_id": string | null;
          "ip_address": string | null;
          "user_agent": string | null;
          "referer": string | null;
          "success": boolean;
          "error_message": string | null;
          "affected_resources": string[] | null;
          "legal_basis": string;
          "data_subject_ids": string[] | null;
          "retention_category": string;
          "retention_days": number;
          "workspace_id": string | null;
          "correlation_id": string | null;
          "session_id": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "timestamp"?: string;
          "actor_id": string;
          "actor_email"?: string | null;
          "actor_role"?: string | null;
          "actor_ip"?: string | null;
          "actor_user_agent"?: string | null;
          "target_type": string;
          "target_id": string;
          "target_identifier"?: string | null;
          "action": string;
          "risk_level": string;
          "reason"?: string | null;
          "metadata"?: Json | null;
          "request_id"?: string | null;
          "ip_address"?: string | null;
          "user_agent"?: string | null;
          "referer"?: string | null;
          "success"?: boolean;
          "error_message"?: string | null;
          "affected_resources"?: string[] | null;
          "legal_basis"?: string;
          "data_subject_ids"?: string[] | null;
          "retention_category"?: string;
          "retention_days"?: number;
          "workspace_id"?: string | null;
          "correlation_id"?: string | null;
          "session_id"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "timestamp"?: string;
          "actor_id"?: string;
          "actor_email"?: string | null;
          "actor_role"?: string | null;
          "actor_ip"?: string | null;
          "actor_user_agent"?: string | null;
          "target_type"?: string;
          "target_id"?: string;
          "target_identifier"?: string | null;
          "action"?: string;
          "risk_level"?: string;
          "reason"?: string | null;
          "metadata"?: Json | null;
          "request_id"?: string | null;
          "ip_address"?: string | null;
          "user_agent"?: string | null;
          "referer"?: string | null;
          "success"?: boolean;
          "error_message"?: string | null;
          "affected_resources"?: string[] | null;
          "legal_basis"?: string;
          "data_subject_ids"?: string[] | null;
          "retention_category"?: string;
          "retention_days"?: number;
          "workspace_id"?: string | null;
          "correlation_id"?: string | null;
          "session_id"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_flags": {
        Row: {
          "id": string;
          "workspace_id": string;
          "program_id": string | null;
          "run_id": string | null;
          "user_id": string | null;
          "source_provider": string | null;
          "source_ref": string | null;
          "subject": string | null;
          "snippet": string | null;
          "reason": string | null;
          "categories": string[];
          "origin": string;
          "status": string;
          "created_at": string;
          "resolved_at": string | null;
          "resolved_by": string | null;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "program_id"?: string | null;
          "run_id"?: string | null;
          "user_id"?: string | null;
          "source_provider"?: string | null;
          "source_ref"?: string | null;
          "subject"?: string | null;
          "snippet"?: string | null;
          "reason"?: string | null;
          "categories": string[];
          "origin"?: string;
          "status"?: string;
          "created_at"?: string;
          "resolved_at"?: string | null;
          "resolved_by"?: string | null;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "program_id"?: string | null;
          "run_id"?: string | null;
          "user_id"?: string | null;
          "source_provider"?: string | null;
          "source_ref"?: string | null;
          "subject"?: string | null;
          "snippet"?: string | null;
          "reason"?: string | null;
          "categories"?: string[];
          "origin"?: string;
          "status"?: string;
          "created_at"?: string;
          "resolved_at"?: string | null;
          "resolved_by"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_flags_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_flags_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_knowledge": {
        Row: {
          "id": string;
          "workspace_id": string;
          "user_id": string;
          "title": string;
          "content": string;
          "created_at": string;
          "updated_at": string;
          "source_type": string;
          "source_name": string | null;
          "embedding_status": string;
          "canvas_x": number | null;
          "canvas_y": number | null;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "user_id": string;
          "title"?: string;
          "content"?: string;
          "created_at"?: string;
          "updated_at"?: string;
          "source_type"?: string;
          "source_name"?: string | null;
          "embedding_status"?: string;
          "canvas_x"?: number | null;
          "canvas_y"?: number | null;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "user_id"?: string;
          "title"?: string;
          "content"?: string;
          "created_at"?: string;
          "updated_at"?: string;
          "source_type"?: string;
          "source_name"?: string | null;
          "embedding_status"?: string;
          "canvas_x"?: number | null;
          "canvas_y"?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_knowledge_chunks": {
        Row: {
          "id": string;
          "knowledge_id": string;
          "workspace_id": string;
          "chunk_index": number;
          "content": string;
          "embedding": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "knowledge_id": string;
          "workspace_id": string;
          "chunk_index"?: number;
          "content": string;
          "embedding"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "knowledge_id"?: string;
          "workspace_id"?: string;
          "chunk_index"?: number;
          "content"?: string;
          "embedding"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_chunks_knowledge_id_fkey";
            columns: ["knowledge_id"];
            isOneToOne: false;
            referencedRelation: "agent_knowledge";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_knowledge_chunks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_knowledge_links": {
        Row: {
          "id": string;
          "workspace_id": string;
          "from_id": string;
          "to_id": string;
          "label": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "from_id": string;
          "to_id": string;
          "label"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "from_id"?: string;
          "to_id"?: string;
          "label"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_links_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_knowledge_links_from_id_fkey";
            columns: ["from_id"];
            isOneToOne: false;
            referencedRelation: "agent_knowledge";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_knowledge_links_to_id_fkey";
            columns: ["to_id"];
            isOneToOne: false;
            referencedRelation: "agent_knowledge";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_relations": {
        Row: {
          "id": string;
          "workspace_id": string;
          "from_program_id": string;
          "rel_type": string;
          "target_kind": string;
          "target_program_id": string | null;
          "target_knowledge_id": string | null;
          "target_label": string | null;
          "label": string | null;
          "run_id": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "from_program_id": string;
          "rel_type": string;
          "target_kind": string;
          "target_program_id"?: string | null;
          "target_knowledge_id"?: string | null;
          "target_label"?: string | null;
          "label"?: string | null;
          "run_id"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "from_program_id"?: string;
          "rel_type"?: string;
          "target_kind"?: string;
          "target_program_id"?: string | null;
          "target_knowledge_id"?: string | null;
          "target_label"?: string | null;
          "label"?: string | null;
          "run_id"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_relations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_relations_from_program_id_fkey";
            columns: ["from_program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_relations_target_program_id_fkey";
            columns: ["target_program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_relations_target_knowledge_id_fkey";
            columns: ["target_knowledge_id"];
            isOneToOne: false;
            referencedRelation: "agent_knowledge";
            referencedColumns: ["id"];
          },
        ];
      };
      "agent_reports": {
        Row: {
          "id": string;
          "run_id": string;
          "program_id": string;
          "user_id": string;
          "title": string;
          "body": string;
          "data": Json | null;
          "dry_run": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "run_id": string;
          "program_id": string;
          "user_id": string;
          "title"?: string;
          "body"?: string;
          "data"?: Json | null;
          "dry_run"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "run_id"?: string;
          "program_id"?: string;
          "user_id"?: string;
          "title"?: string;
          "body"?: string;
          "data"?: Json | null;
          "dry_run"?: boolean;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_reports_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_reports_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "api_keys": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "name": string;
          "provider": string;
          "vault_secret_id": string;
          "is_valid": boolean | null;
          "last_validated_at": string | null;
          "created_at": string | null;
          "workspace_id": string;
          "last_used_at": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "name": string;
          "provider": string;
          "vault_secret_id": string;
          "is_valid"?: boolean | null;
          "last_validated_at"?: string | null;
          "created_at"?: string | null;
          "workspace_id": string;
          "last_used_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "name"?: string;
          "provider"?: string;
          "vault_secret_id"?: string;
          "is_valid"?: boolean | null;
          "last_validated_at"?: string | null;
          "created_at"?: string | null;
          "workspace_id"?: string;
          "last_used_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "app_logs": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "program_id": string | null;
          "run_id": string | null;
          "level": string;
          "source": string;
          "event": string;
          "status": string;
          "message": string;
          "details": Json | null;
          "duration_ms": number | null;
          "created_at": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "program_id"?: string | null;
          "run_id"?: string | null;
          "level": string;
          "source": string;
          "event": string;
          "status": string;
          "message": string;
          "details"?: Json | null;
          "duration_ms"?: number | null;
          "created_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "program_id"?: string | null;
          "run_id"?: string | null;
          "level"?: string;
          "source"?: string;
          "event"?: string;
          "status"?: string;
          "message"?: string;
          "details"?: Json | null;
          "duration_ms"?: number | null;
          "created_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_logs_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_logs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "approval_escalations": {
        Row: {
          "id": string;
          "approval_id": string;
          "escalated_to": string;
          "escalation_reason": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "approval_id": string;
          "escalated_to": string;
          "escalation_reason": string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "approval_id"?: string;
          "escalated_to"?: string;
          "escalation_reason"?: string;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_escalations_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
        ];
      };
      "approvals": {
        Row: {
          "id": string;
          "node_execution_id": string;
          "user_id": string;
          "status": string | null;
          "context": Json | null;
          "decision_note": string | null;
          "decided_at": string | null;
          "created_at": string | null;
          "notified_at": string | null;
          "requested_action": string | null;
          "ai_generated_recommendation": string | null;
          "data_summary": string | null;
          "risk_flags": Json | null;
          "approver_id": string | null;
          "decision": string | null;
          "decision_timestamp": string | null;
          "final_executed_action": Json | null;
          "sla_hours": number | null;
        };
        Insert: {
          "id"?: string;
          "node_execution_id": string;
          "user_id": string;
          "status"?: string | null;
          "context"?: Json | null;
          "decision_note"?: string | null;
          "decided_at"?: string | null;
          "created_at"?: string | null;
          "notified_at"?: string | null;
          "requested_action"?: string | null;
          "ai_generated_recommendation"?: string | null;
          "data_summary"?: string | null;
          "risk_flags"?: Json | null;
          "approver_id"?: string | null;
          "decision"?: string | null;
          "decision_timestamp"?: string | null;
          "final_executed_action"?: Json | null;
          "sla_hours"?: number | null;
        };
        Update: {
          "id"?: string;
          "node_execution_id"?: string;
          "user_id"?: string;
          "status"?: string | null;
          "context"?: Json | null;
          "decision_note"?: string | null;
          "decided_at"?: string | null;
          "created_at"?: string | null;
          "notified_at"?: string | null;
          "requested_action"?: string | null;
          "ai_generated_recommendation"?: string | null;
          "data_summary"?: string | null;
          "risk_flags"?: Json | null;
          "approver_id"?: string | null;
          "decision"?: string | null;
          "decision_timestamp"?: string | null;
          "final_executed_action"?: Json | null;
          "sla_hours"?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_node_execution_id_fkey";
            columns: ["node_execution_id"];
            isOneToOne: false;
            referencedRelation: "node_executions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "auto_recharge_configs": {
        Row: {
          "user_id": string;
          "is_enabled": boolean;
          "last_triggered_at": string | null;
          "updated_at": string;
          "threshold_credits": number;
          "recharge_credits": number;
        };
        Insert: {
          "user_id": string;
          "is_enabled"?: boolean;
          "last_triggered_at"?: string | null;
          "updated_at"?: string;
          "threshold_credits"?: number;
          "recharge_credits"?: number;
        };
        Update: {
          "user_id"?: string;
          "is_enabled"?: boolean;
          "last_triggered_at"?: string | null;
          "updated_at"?: string;
          "threshold_credits"?: number;
          "recharge_credits"?: number;
        };
        Relationships: [];
      };
      "billing_plans": {
        Row: {
          "id": string;
          "name": string;
          "slug": string;
          "seat_price_monthly": number;
          "included_seats": number;
          "execution_price_per_minute": number;
          "included_execution_minutes": number;
          "byok_platform_fee_monthly": number;
          "stripe_price_id": string | null;
          "stripe_byok_price_id": string | null;
          "features": Json;
          "sort_order": number;
          "is_active": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "slug": string;
          "seat_price_monthly"?: number;
          "included_seats"?: number;
          "execution_price_per_minute"?: number;
          "included_execution_minutes"?: number;
          "byok_platform_fee_monthly"?: number;
          "stripe_price_id"?: string | null;
          "stripe_byok_price_id"?: string | null;
          "features": Json;
          "sort_order"?: number;
          "is_active"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "slug"?: string;
          "seat_price_monthly"?: number;
          "included_seats"?: number;
          "execution_price_per_minute"?: number;
          "included_execution_minutes"?: number;
          "byok_platform_fee_monthly"?: number;
          "stripe_price_id"?: string | null;
          "stripe_byok_price_id"?: string | null;
          "features"?: Json;
          "sort_order"?: number;
          "is_active"?: boolean;
          "created_at"?: string;
        };
        Relationships: [];
      };
      "compliance_assessments": {
        Row: {
          "id": string;
          "program_id": string;
          "risk_level": string;
          "risk_score": number;
          "factors": Json;
          "assessed_at": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "risk_level": string;
          "risk_score": number;
          "factors": Json;
          "assessed_at"?: string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "risk_level"?: string;
          "risk_score"?: number;
          "factors"?: Json;
          "assessed_at"?: string;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_assessments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "connection_webhook_secrets": {
        Row: {
          "id": string;
          "connection_id": string;
          "provider": string;
          "secret_name": string;
          "vault_secret_id": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "connection_id": string;
          "provider": string;
          "secret_name": string;
          "vault_secret_id": string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "connection_id"?: string;
          "provider"?: string;
          "secret_name"?: string;
          "vault_secret_id"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_webhook_secrets_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connections";
            referencedColumns: ["id"];
          },
        ];
      };
      "connections": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "name": string;
          "provider": string;
          "auth_type": string;
          "vault_secret_id": string;
          "scopes": string[] | null;
          "metadata": Json | null;
          "is_valid": boolean | null;
          "last_validated_at": string | null;
          "created_at": string | null;
          "updated_at": string | null;
          "workspace_id": string;
          "rotation_due_at": string | null;
          "last_health_check_at": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "name": string;
          "provider": string;
          "auth_type": string;
          "vault_secret_id": string;
          "scopes"?: string[] | null;
          "metadata"?: Json | null;
          "is_valid"?: boolean | null;
          "last_validated_at"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "workspace_id": string;
          "rotation_due_at"?: string | null;
          "last_health_check_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "name"?: string;
          "provider"?: string;
          "auth_type"?: string;
          "vault_secret_id"?: string;
          "scopes"?: string[] | null;
          "metadata"?: Json | null;
          "is_valid"?: boolean | null;
          "last_validated_at"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "workspace_id"?: string;
          "rotation_due_at"?: string | null;
          "last_health_check_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "connector_health_events": {
        Row: {
          "id": string;
          "connector_name": string;
          "workspace_id": string | null;
          "check_type": string;
          "status": string;
          "error_message": string | null;
          "latency_ms": number | null;
          "retry_count": number;
          "next_retry_at": string | null;
          "checked_at": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "connector_name": string;
          "workspace_id"?: string | null;
          "check_type": string;
          "status": string;
          "error_message"?: string | null;
          "latency_ms"?: number | null;
          "retry_count"?: number;
          "next_retry_at"?: string | null;
          "checked_at"?: string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "connector_name"?: string;
          "workspace_id"?: string | null;
          "check_type"?: string;
          "status"?: string;
          "error_message"?: string | null;
          "latency_ms"?: number | null;
          "retry_count"?: number;
          "next_retry_at"?: string | null;
          "checked_at"?: string;
          "created_at"?: string;
        };
        Relationships: [];
      };
      "credential_locks": {
        Row: {
          "id": string;
          "lock_key": string;
          "lock_id": string;
          "created_at": string | null;
          "expires_at": string;
        };
        Insert: {
          "id"?: string;
          "lock_key": string;
          "lock_id": string;
          "created_at"?: string | null;
          "expires_at": string;
        };
        Update: {
          "id"?: string;
          "lock_key"?: string;
          "lock_id"?: string;
          "created_at"?: string | null;
          "expires_at"?: string;
        };
        Relationships: [];
      };
      "credit_purchases": {
        Row: {
          "id": string;
          "user_id": string;
          "workspace_id": string | null;
          "price_usd": number;
          "stripe_session_id": string | null;
          "stripe_payment_intent_id": string | null;
          "status": string;
          "created_at": string;
          "amount_credits": number;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "workspace_id"?: string | null;
          "price_usd": number;
          "stripe_session_id"?: string | null;
          "stripe_payment_intent_id"?: string | null;
          "status"?: string;
          "created_at"?: string;
          "amount_credits": number;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "workspace_id"?: string | null;
          "price_usd"?: number;
          "stripe_session_id"?: string | null;
          "stripe_payment_intent_id"?: string | null;
          "status"?: string;
          "created_at"?: string;
          "amount_credits"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "credit_purchases_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "data_retention_audit": {
        Row: {
          "id": string;
          "job_name": string;
          "cleared_run_payloads": number;
          "cleared_node_input_payloads": number;
          "cleared_node_output_payloads": number;
          "deleted_runs": number;
          "deleted_audit_rows": number;
          "details": Json | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "job_name": string;
          "cleared_run_payloads"?: number;
          "cleared_node_input_payloads"?: number;
          "cleared_node_output_payloads"?: number;
          "deleted_runs"?: number;
          "deleted_audit_rows"?: number;
          "details"?: Json | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "job_name"?: string;
          "cleared_run_payloads"?: number;
          "cleared_node_input_payloads"?: number;
          "cleared_node_output_payloads"?: number;
          "deleted_runs"?: number;
          "deleted_audit_rows"?: number;
          "details"?: Json | null;
          "created_at"?: string;
        };
        Relationships: [];
      };
      "data_subject_requests": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "request_type": string;
          "status": string;
          "requester_email": string | null;
          "details": string | null;
          "response_summary": string | null;
          "submitted_at": string;
          "due_at": string;
          "completed_at": string | null;
          "created_at": string;
          "updated_at": string;
          "user_followup": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "request_type": string;
          "status"?: string;
          "requester_email"?: string | null;
          "details"?: string | null;
          "response_summary"?: string | null;
          "submitted_at"?: string;
          "due_at"?: string;
          "completed_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "user_followup"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "request_type"?: string;
          "status"?: string;
          "requester_email"?: string | null;
          "details"?: string | null;
          "response_summary"?: string | null;
          "submitted_at"?: string;
          "due_at"?: string;
          "completed_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "user_followup"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "dead_letter_entries": {
        Row: {
          "id": string;
          "program_id": string;
          "run_id": string;
          "node_id": string;
          "node_type": string;
          "node_config": Json;
          "input_data": Json;
          "error_message": string;
          "error_type": string;
          "attempt_count": number;
          "retry_policy": Json;
          "created_at": string;
          "updated_at": string;
          "retried_at": string | null;
          "retry_count": number;
          "last_error": string | null;
          "status": string;
          "metadata": Json;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "run_id": string;
          "node_id": string;
          "node_type": string;
          "node_config": Json;
          "input_data": Json;
          "error_message": string;
          "error_type": string;
          "attempt_count"?: number;
          "retry_policy": Json;
          "created_at"?: string;
          "updated_at"?: string;
          "retried_at"?: string | null;
          "retry_count"?: number;
          "last_error"?: string | null;
          "status"?: string;
          "metadata": Json;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "run_id"?: string;
          "node_id"?: string;
          "node_type"?: string;
          "node_config"?: Json;
          "input_data"?: Json;
          "error_message"?: string;
          "error_type"?: string;
          "attempt_count"?: number;
          "retry_policy"?: Json;
          "created_at"?: string;
          "updated_at"?: string;
          "retried_at"?: string | null;
          "retry_count"?: number;
          "last_error"?: string | null;
          "status"?: string;
          "metadata"?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "dead_letter_entries_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dead_letter_entries_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "device_folder_grants": {
        Row: {
          "id": string;
          "device_id": string;
          "workspace_id": string;
          "path": string;
          "permission": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "device_id": string;
          "workspace_id": string;
          "path": string;
          "permission"?: string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "device_id"?: string;
          "workspace_id"?: string;
          "path"?: string;
          "permission"?: string;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_folder_grants_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_folder_grants_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "devices": {
        Row: {
          "id": string;
          "workspace_id": string;
          "user_id": string;
          "name": string;
          "platform": string;
          "token_hash": string;
          "token_prefix": string;
          "paired_at": string | null;
          "last_seen_at": string | null;
          "revoked_at": string | null;
          "created_at": string;
          "push_token": string | null;
          "push_platform": string | null;
          "push_token_updated_at": string | null;
          "is_default_2fa": boolean;
          "client_install_id": string | null;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "user_id": string;
          "name"?: string;
          "platform"?: string;
          "token_hash": string;
          "token_prefix"?: string;
          "paired_at"?: string | null;
          "last_seen_at"?: string | null;
          "revoked_at"?: string | null;
          "created_at"?: string;
          "push_token"?: string | null;
          "push_platform"?: string | null;
          "push_token_updated_at"?: string | null;
          "is_default_2fa"?: boolean;
          "client_install_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "user_id"?: string;
          "name"?: string;
          "platform"?: string;
          "token_hash"?: string;
          "token_prefix"?: string;
          "paired_at"?: string | null;
          "last_seen_at"?: string | null;
          "revoked_at"?: string | null;
          "created_at"?: string;
          "push_token"?: string | null;
          "push_platform"?: string | null;
          "push_token_updated_at"?: string | null;
          "is_default_2fa"?: boolean;
          "client_install_id"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "devices_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "dsr_messages": {
        Row: {
          "id": string;
          "dsr_id": string;
          "sender": string;
          "body": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "dsr_id": string;
          "sender": string;
          "body": string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "dsr_id"?: string;
          "sender"?: string;
          "body"?: string;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dsr_messages_dsr_id_fkey";
            columns: ["dsr_id"];
            isOneToOne: false;
            referencedRelation: "data_subject_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      "feedback": {
        Row: {
          "id": string;
          "user_id": string;
          "user_email": string;
          "type": string;
          "message": string;
          "page_path": string | null;
          "status": string;
          "admin_notes": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "user_email": string;
          "type"?: string;
          "message": string;
          "page_path"?: string | null;
          "status"?: string;
          "admin_notes"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "user_email"?: string;
          "type"?: string;
          "message"?: string;
          "page_path"?: string | null;
          "status"?: string;
          "admin_notes"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
      };
      "file_operations": {
        Row: {
          "id": string;
          "run_id": string | null;
          "node_execution_id": string | null;
          "device_id": string | null;
          "workspace_id": string;
          "user_id": string;
          "op_type": string;
          "args": Json;
          "status": string;
          "result": Json | null;
          "error": string | null;
          "requested_at": string;
          "claimed_at": string | null;
          "completed_at": string | null;
          "expires_at": string;
        };
        Insert: {
          "id"?: string;
          "run_id"?: string | null;
          "node_execution_id"?: string | null;
          "device_id"?: string | null;
          "workspace_id": string;
          "user_id": string;
          "op_type": string;
          "args": Json;
          "status"?: string;
          "result"?: Json | null;
          "error"?: string | null;
          "requested_at"?: string;
          "claimed_at"?: string | null;
          "completed_at"?: string | null;
          "expires_at"?: string;
        };
        Update: {
          "id"?: string;
          "run_id"?: string | null;
          "node_execution_id"?: string | null;
          "device_id"?: string | null;
          "workspace_id"?: string;
          "user_id"?: string;
          "op_type"?: string;
          "args"?: Json;
          "status"?: string;
          "result"?: Json | null;
          "error"?: string | null;
          "requested_at"?: string;
          "claimed_at"?: string | null;
          "completed_at"?: string | null;
          "expires_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "file_operations_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_operations_node_execution_id_fkey";
            columns: ["node_execution_id"];
            isOneToOne: false;
            referencedRelation: "node_executions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_operations_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_operations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "file_snapshots": {
        Row: {
          "id": string;
          "workspace_id": string;
          "device_id": string;
          "run_id": string | null;
          "op_id": string | null;
          "snapshot_ref": string;
          "original_path": string;
          "operation": string;
          "size_bytes": number;
          "existed": boolean;
          "created_at": string;
          "restored_at": string | null;
          "expires_at": string | null;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "device_id": string;
          "run_id"?: string | null;
          "op_id"?: string | null;
          "snapshot_ref": string;
          "original_path": string;
          "operation": string;
          "size_bytes"?: number;
          "existed"?: boolean;
          "created_at"?: string;
          "restored_at"?: string | null;
          "expires_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "device_id"?: string;
          "run_id"?: string | null;
          "op_id"?: string | null;
          "snapshot_ref"?: string;
          "original_path"?: string;
          "operation"?: string;
          "size_bytes"?: number;
          "existed"?: boolean;
          "created_at"?: string;
          "restored_at"?: string | null;
          "expires_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "file_snapshots_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_snapshots_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_snapshots_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_snapshots_op_id_fkey";
            columns: ["op_id"];
            isOneToOne: false;
            referencedRelation: "file_operations";
            referencedColumns: ["id"];
          },
        ];
      };
      "genesis_sessions": {
        Row: {
          "id": string;
          "user_id": string;
          "workspace_id": string;
          "program_id": string;
          "status": string;
          "clarifications": Json;
          "created_at": string;
          "updated_at": string;
          "expires_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "workspace_id": string;
          "program_id": string;
          "status"?: string;
          "clarifications": Json;
          "created_at"?: string;
          "updated_at"?: string;
          "expires_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "workspace_id"?: string;
          "program_id"?: string;
          "status"?: string;
          "clarifications"?: Json;
          "created_at"?: string;
          "updated_at"?: string;
          "expires_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "genesis_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "genesis_sessions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "genesis_sessions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "llm_usage_logs": {
        Row: {
          "id": string;
          "user_id": string;
          "model": string;
          "prompt_tokens": number | null;
          "completion_tokens": number | null;
          "total_tokens": number | null;
          "estimated_cost_usd": number | null;
          "created_at": string | null;
          "source": string;
          "billing": string;
          "billed_credits": number;
          "node_id": string | null;
          "run_id": string | null;
          "workspace_id": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "model": string;
          "prompt_tokens"?: number | null;
          "completion_tokens"?: number | null;
          "total_tokens"?: number | null;
          "estimated_cost_usd"?: number | null;
          "created_at"?: string | null;
          "source"?: string;
          "billing"?: string;
          "billed_credits"?: number;
          "node_id"?: string | null;
          "run_id"?: string | null;
          "workspace_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "model"?: string;
          "prompt_tokens"?: number | null;
          "completion_tokens"?: number | null;
          "total_tokens"?: number | null;
          "estimated_cost_usd"?: number | null;
          "created_at"?: string | null;
          "source"?: string;
          "billing"?: string;
          "billed_credits"?: number;
          "node_id"?: string | null;
          "run_id"?: string | null;
          "workspace_id"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_usage_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "metrics": {
        Row: {
          "id": string;
          "timestamp": string;
          "metric_name": string;
          "value": number;
          "tags": Json | null;
        };
        Insert: {
          "id"?: string;
          "timestamp"?: string;
          "metric_name": string;
          "value"?: number;
          "tags"?: Json | null;
        };
        Update: {
          "id"?: string;
          "timestamp"?: string;
          "metric_name"?: string;
          "value"?: number;
          "tags"?: Json | null;
        };
        Relationships: [];
      };
      "node_executions": {
        Row: {
          "id": string;
          "run_id": string;
          "node_id": string;
          "status": string | null;
          "input_payload": Json | null;
          "output_payload": Json | null;
          "error_message": string | null;
          "retry_count": number | null;
          "started_at": string | null;
          "completed_at": string | null;
          "created_at": string | null;
          "prompt_tokens": number;
          "completion_tokens": number;
          "total_tokens": number;
          "estimated_cost_usd": number;
          "connector_api_calls": number;
          "model_call_count": number;
          "provider_id": string | null;
          "model_id": string | null;
          "prompt_hash": string | null;
          "input_hash": string | null;
          "output_hash": string | null;
          "stored_full_prompt": boolean;
          "stored_full_input": boolean;
          "stored_full_output": boolean;
          "tool_calls": Json | null;
          "approval_request": Json | null;
          "approval_decision": Json | null;
          "approver_id": string | null;
          "data_region": string | null;
          "policy_checks": Json | null;
          "block_warning_reasons": Json | null;
          "retention_expiry": string | null;
          "token_usage": Json | null;
        };
        Insert: {
          "id"?: string;
          "run_id": string;
          "node_id": string;
          "status"?: string | null;
          "input_payload"?: Json | null;
          "output_payload"?: Json | null;
          "error_message"?: string | null;
          "retry_count"?: number | null;
          "started_at"?: string | null;
          "completed_at"?: string | null;
          "created_at"?: string | null;
          "prompt_tokens"?: number;
          "completion_tokens"?: number;
          "total_tokens"?: number;
          "estimated_cost_usd"?: number;
          "connector_api_calls"?: number;
          "model_call_count"?: number;
          "provider_id"?: string | null;
          "model_id"?: string | null;
          "prompt_hash"?: string | null;
          "input_hash"?: string | null;
          "output_hash"?: string | null;
          "stored_full_prompt"?: boolean;
          "stored_full_input"?: boolean;
          "stored_full_output"?: boolean;
          "tool_calls"?: Json | null;
          "approval_request"?: Json | null;
          "approval_decision"?: Json | null;
          "approver_id"?: string | null;
          "data_region"?: string | null;
          "policy_checks"?: Json | null;
          "block_warning_reasons"?: Json | null;
          "retention_expiry"?: string | null;
          "token_usage"?: Json | null;
        };
        Update: {
          "id"?: string;
          "run_id"?: string;
          "node_id"?: string;
          "status"?: string | null;
          "input_payload"?: Json | null;
          "output_payload"?: Json | null;
          "error_message"?: string | null;
          "retry_count"?: number | null;
          "started_at"?: string | null;
          "completed_at"?: string | null;
          "created_at"?: string | null;
          "prompt_tokens"?: number;
          "completion_tokens"?: number;
          "total_tokens"?: number;
          "estimated_cost_usd"?: number;
          "connector_api_calls"?: number;
          "model_call_count"?: number;
          "provider_id"?: string | null;
          "model_id"?: string | null;
          "prompt_hash"?: string | null;
          "input_hash"?: string | null;
          "output_hash"?: string | null;
          "stored_full_prompt"?: boolean;
          "stored_full_input"?: boolean;
          "stored_full_output"?: boolean;
          "tool_calls"?: Json | null;
          "approval_request"?: Json | null;
          "approval_decision"?: Json | null;
          "approver_id"?: string | null;
          "data_region"?: string | null;
          "policy_checks"?: Json | null;
          "block_warning_reasons"?: Json | null;
          "retention_expiry"?: string | null;
          "token_usage"?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "node_executions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "node_executions_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "notifications": {
        Row: {
          "id": string;
          "user_id": string;
          "type": string;
          "title": string;
          "body": string;
          "href": string | null;
          "read_at": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "type": string;
          "title": string;
          "body": string;
          "href"?: string | null;
          "read_at"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "type"?: string;
          "title"?: string;
          "body"?: string;
          "href"?: string | null;
          "read_at"?: string | null;
          "created_at"?: string;
        };
        Relationships: [];
      };
      "oauth_state_nonces": {
        Row: {
          "flow_id": string;
          "user_id": string;
          "nonce_hash": string;
          "issued_at": string;
          "expires_at": string;
          "consumed_at": string | null;
          "created_at": string;
        };
        Insert: {
          "flow_id": string;
          "user_id": string;
          "nonce_hash": string;
          "issued_at"?: string;
          "expires_at": string;
          "consumed_at"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "flow_id"?: string;
          "user_id"?: string;
          "nonce_hash"?: string;
          "issued_at"?: string;
          "expires_at"?: string;
          "consumed_at"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_state_nonces_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "onboarding_profiles": {
        Row: {
          "user_id": string;
          "account_type": string | null;
          "team_size": string | null;
          "industry": string | null;
          "role": string | null;
          "goals": string[];
          "tools": string[];
          "current_processes": string | null;
          "automation_wishes": string | null;
          "profile_consent": boolean;
          "consent_at": string | null;
          "ai_context": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "user_id": string;
          "account_type"?: string | null;
          "team_size"?: string | null;
          "industry"?: string | null;
          "role"?: string | null;
          "goals": string[];
          "tools": string[];
          "current_processes"?: string | null;
          "automation_wishes"?: string | null;
          "profile_consent"?: boolean;
          "consent_at"?: string | null;
          "ai_context"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "user_id"?: string;
          "account_type"?: string | null;
          "team_size"?: string | null;
          "industry"?: string | null;
          "role"?: string | null;
          "goals"?: string[];
          "tools"?: string[];
          "current_processes"?: string | null;
          "automation_wishes"?: string | null;
          "profile_consent"?: boolean;
          "consent_at"?: string | null;
          "ai_context"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
      };
      "org_invites": {
        Row: {
          "id": string;
          "org_id": string;
          "email": string;
          "role": string;
          "token": string;
          "expires_at": string;
          "created_at": string;
          "accepted_at": string | null;
        };
        Insert: {
          "id"?: string;
          "org_id": string;
          "email": string;
          "role": string;
          "token": string;
          "expires_at": string;
          "created_at"?: string;
          "accepted_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "org_id"?: string;
          "email"?: string;
          "role"?: string;
          "token"?: string;
          "expires_at"?: string;
          "created_at"?: string;
          "accepted_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      "org_memberships": {
        Row: {
          "id": string;
          "org_id": string;
          "user_id": string;
          "role": string;
          "invited_by": string | null;
          "invited_at": string | null;
          "accepted_at": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "org_id": string;
          "user_id": string;
          "role": string;
          "invited_by"?: string | null;
          "invited_at"?: string | null;
          "accepted_at"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "org_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "invited_by"?: string | null;
          "invited_at"?: string | null;
          "accepted_at"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      "org_subscriptions": {
        Row: {
          "id": string;
          "org_id": string;
          "plan_id": string;
          "billing_mode": string;
          "stripe_subscription_id": string | null;
          "stripe_customer_id": string | null;
          "status": string;
          "current_period_start": string;
          "current_period_end": string;
          "seats_count": number;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "org_id": string;
          "plan_id": string;
          "billing_mode"?: string;
          "stripe_subscription_id"?: string | null;
          "stripe_customer_id"?: string | null;
          "status"?: string;
          "current_period_start"?: string;
          "current_period_end"?: string;
          "seats_count"?: number;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "org_id"?: string;
          "plan_id"?: string;
          "billing_mode"?: string;
          "stripe_subscription_id"?: string | null;
          "stripe_customer_id"?: string | null;
          "status"?: string;
          "current_period_start"?: string;
          "current_period_end"?: string;
          "seats_count"?: number;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "billing_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      "organizations": {
        Row: {
          "id": string;
          "name": string;
          "slug": string;
          "owner_id": string;
          "created_at": string;
          "updated_at": string;
          "subscription_id": string | null;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "slug": string;
          "owner_id": string;
          "created_at"?: string;
          "updated_at"?: string;
          "subscription_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "slug"?: string;
          "owner_id"?: string;
          "created_at"?: string;
          "updated_at"?: string;
          "subscription_id"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "org_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      "personal_api_tokens": {
        Row: {
          "id": string;
          "user_id": string;
          "name": string;
          "token_prefix": string;
          "token_hash": string;
          "last_used_at": string | null;
          "created_at": string;
          "updated_at": string;
          "kind": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "name": string;
          "token_prefix": string;
          "token_hash": string;
          "last_used_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "kind"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "name"?: string;
          "token_prefix"?: string;
          "token_hash"?: string;
          "last_used_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "kind"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_api_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "playground_test_cases": {
        Row: {
          "id": string;
          "user_id": string;
          "name": string;
          "prompt": string;
          "expected_schema": Json | null;
          "tags": string[] | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "name": string;
          "prompt": string;
          "expected_schema"?: Json | null;
          "tags"?: string[] | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "name"?: string;
          "prompt"?: string;
          "expected_schema"?: Json | null;
          "tags"?: string[] | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
      };
      "posts": {
        Row: {
          "id": string;
          "title": string;
          "slug": string;
          "content": Json;
          "cover_image_url": string | null;
          "published_at": string | null;
          "tags": string[];
          "author_name": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "title": string;
          "slug": string;
          "content": Json;
          "cover_image_url"?: string | null;
          "published_at"?: string | null;
          "tags": string[];
          "author_name"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "title"?: string;
          "slug"?: string;
          "content"?: Json;
          "cover_image_url"?: string | null;
          "published_at"?: string | null;
          "tags"?: string[];
          "author_name"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
      };
      "profiles": {
        Row: {
          "id": string;
          "org_id": string | null;
          "display_name": string | null;
          "avatar_url": string | null;
          "tier": string | null;
          "created_at": string | null;
          "updated_at": string | null;
          "plan_expires_at": string | null;
          "bonus_runs": number;
          "is_beta_tester": boolean;
          "processing_restricted": boolean;
          "processing_restricted_at": string | null;
          "processing_restriction_reason": string | null;
          "is_admin": boolean | null;
          "included_credits_reset_at": string;
          "notification_preferences": Json;
          "stripe_payment_method_id": string | null;
          "username": string | null;
          "is_expert": boolean;
          "bio": string | null;
          "team_role": string | null;
          "purchased_credits": number;
          "included_credits_used": number;
          "legal_consented_at": string | null;
          "legal_consent_version": string | null;
          "email_2fa_enabled": boolean;
          "totp_enabled": boolean;
          "totp_secret": string | null;
          "totp_verified_at": string | null;
          "genesis_uses_this_month": number;
          "genesis_month_reset_at": string | null;
          "bonus_genesis_uses": number;
          "analytics_opt_out": boolean;
        };
        Insert: {
          "id": string;
          "org_id"?: string | null;
          "display_name"?: string | null;
          "avatar_url"?: string | null;
          "tier"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "plan_expires_at"?: string | null;
          "bonus_runs"?: number;
          "is_beta_tester"?: boolean;
          "processing_restricted"?: boolean;
          "processing_restricted_at"?: string | null;
          "processing_restriction_reason"?: string | null;
          "is_admin"?: boolean | null;
          "included_credits_reset_at"?: string;
          "notification_preferences": Json;
          "stripe_payment_method_id"?: string | null;
          "username"?: string | null;
          "is_expert"?: boolean;
          "bio"?: string | null;
          "team_role"?: string | null;
          "purchased_credits"?: number;
          "included_credits_used"?: number;
          "legal_consented_at"?: string | null;
          "legal_consent_version"?: string | null;
          "email_2fa_enabled"?: boolean;
          "totp_enabled"?: boolean;
          "totp_secret"?: string | null;
          "totp_verified_at"?: string | null;
          "genesis_uses_this_month"?: number;
          "genesis_month_reset_at"?: string | null;
          "bonus_genesis_uses"?: number;
          "analytics_opt_out"?: boolean;
        };
        Update: {
          "id"?: string;
          "org_id"?: string | null;
          "display_name"?: string | null;
          "avatar_url"?: string | null;
          "tier"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "plan_expires_at"?: string | null;
          "bonus_runs"?: number;
          "is_beta_tester"?: boolean;
          "processing_restricted"?: boolean;
          "processing_restricted_at"?: string | null;
          "processing_restriction_reason"?: string | null;
          "is_admin"?: boolean | null;
          "included_credits_reset_at"?: string;
          "notification_preferences"?: Json;
          "stripe_payment_method_id"?: string | null;
          "username"?: string | null;
          "is_expert"?: boolean;
          "bio"?: string | null;
          "team_role"?: string | null;
          "purchased_credits"?: number;
          "included_credits_used"?: number;
          "legal_consented_at"?: string | null;
          "legal_consent_version"?: string | null;
          "email_2fa_enabled"?: boolean;
          "totp_enabled"?: boolean;
          "totp_secret"?: string | null;
          "totp_verified_at"?: string | null;
          "genesis_uses_this_month"?: number;
          "genesis_month_reset_at"?: string | null;
          "bonus_genesis_uses"?: number;
          "analytics_opt_out"?: boolean;
        };
        Relationships: [];
      };
      "program_approvals": {
        Row: {
          "id": string;
          "program_id": string;
          "reviewer_id": string;
          "status": string;
          "note": string | null;
          "created_at": string;
          "decided_at": string | null;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "reviewer_id": string;
          "status"?: string;
          "note"?: string | null;
          "created_at"?: string;
          "decided_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "reviewer_id"?: string;
          "status"?: string;
          "note"?: string | null;
          "created_at"?: string;
          "decided_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_approvals_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_comments": {
        Row: {
          "id": string;
          "program_id": string;
          "node_id": string;
          "user_id": string;
          "body": string;
          "resolved": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "node_id": string;
          "user_id": string;
          "body": string;
          "resolved"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "node_id"?: string;
          "user_id"?: string;
          "body"?: string;
          "resolved"?: boolean;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_comments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_connections": {
        Row: {
          "program_id": string;
          "connection_id": string;
        };
        Insert: {
          "program_id": string;
          "connection_id": string;
        };
        Update: {
          "program_id"?: string;
          "connection_id"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_connections_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_connections_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connections";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_dpia_drafts": {
        Row: {
          "id": string;
          "program_id": string;
          "created_by": string | null;
          "source_kind": string;
          "review_status": string;
          "reviewed_by": string | null;
          "reviewed_at": string | null;
          "content": string;
          "source_schema_version": number | null;
          "source_program_updated_at": string | null;
          "source_snapshot": Json;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "created_by"?: string | null;
          "source_kind": string;
          "review_status"?: string;
          "reviewed_by"?: string | null;
          "reviewed_at"?: string | null;
          "content": string;
          "source_schema_version"?: number | null;
          "source_program_updated_at"?: string | null;
          "source_snapshot": Json;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "created_by"?: string | null;
          "source_kind"?: string;
          "review_status"?: string;
          "reviewed_by"?: string | null;
          "reviewed_at"?: string | null;
          "content"?: string;
          "source_schema_version"?: number | null;
          "source_program_updated_at"?: string | null;
          "source_snapshot"?: Json;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_dpia_drafts_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_memberships": {
        Row: {
          "program_id": string;
          "user_id": string;
          "role": string;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "program_id": string;
          "user_id": string;
          "role": string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "program_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_memberships_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_memberships_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_notification_settings": {
        Row: {
          "user_id": string;
          "program_id": string;
          "notify_failures": boolean;
          "notify_completions": boolean;
          "updated_at": string;
        };
        Insert: {
          "user_id": string;
          "program_id": string;
          "notify_failures"?: boolean;
          "notify_completions"?: boolean;
          "updated_at"?: string;
        };
        Update: {
          "user_id"?: string;
          "program_id"?: string;
          "notify_failures"?: boolean;
          "notify_completions"?: boolean;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_notification_settings_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_shares": {
        Row: {
          "program_id": string;
          "team_id": string;
          "permission": string;
          "shared_at": string;
        };
        Insert: {
          "program_id": string;
          "team_id": string;
          "permission": string;
          "shared_at"?: string;
        };
        Update: {
          "program_id"?: string;
          "team_id"?: string;
          "permission"?: string;
          "shared_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_shares_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_shares_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      "program_versions": {
        Row: {
          "id": string;
          "program_id": string;
          "version": number;
          "schema": Json;
          "change_summary": string | null;
          "created_at": string | null;
          "patch": Json | null;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "version": number;
          "schema": Json;
          "change_summary"?: string | null;
          "created_at"?: string | null;
          "patch"?: Json | null;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "version"?: number;
          "schema"?: Json;
          "change_summary"?: string | null;
          "created_at"?: string | null;
          "patch"?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_versions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "programs": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "name": string;
          "description": string | null;
          "schema": Json;
          "schema_version": number | null;
          "execution_mode": string | null;
          "is_active": boolean | null;
          "conflict_policy": string | null;
          "last_run_at": string | null;
          "created_at": string | null;
          "updated_at": string | null;
          "is_public": boolean;
          "tags": string[];
          "fork_count": number;
          "published_at": string | null;
          "public_author_name": string | null;
          "workspace_id": string;
          "visibility": string;
          "folder_id": string | null;
          "ai_use_case_category": string | null;
          "ai_act_risk_level": string;
          "customer_role": string;
          "human_oversight_required": boolean;
          "transparency_notice_required": boolean;
          "high_risk_documentation_required": boolean;
          "prohibited_reason": string | null;
          "reviewer": string | null;
          "reviewed_at": string | null;
          "ai_act_notes": string | null;
          "legal_review_override": boolean;
          "program_type": string;
          "agent_state": string | null;
          "agent_discard_after_run": boolean;
          "agent_saved_template": boolean;
          "decision_log": Json | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "name": string;
          "description"?: string | null;
          "schema": Json;
          "schema_version"?: number | null;
          "execution_mode"?: string | null;
          "is_active"?: boolean | null;
          "conflict_policy"?: string | null;
          "last_run_at"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "is_public"?: boolean;
          "tags": string[];
          "fork_count"?: number;
          "published_at"?: string | null;
          "public_author_name"?: string | null;
          "workspace_id": string;
          "visibility"?: string;
          "folder_id"?: string | null;
          "ai_use_case_category"?: string | null;
          "ai_act_risk_level"?: string;
          "customer_role"?: string;
          "human_oversight_required"?: boolean;
          "transparency_notice_required"?: boolean;
          "high_risk_documentation_required"?: boolean;
          "prohibited_reason"?: string | null;
          "reviewer"?: string | null;
          "reviewed_at"?: string | null;
          "ai_act_notes"?: string | null;
          "legal_review_override"?: boolean;
          "program_type"?: string;
          "agent_state"?: string | null;
          "agent_discard_after_run"?: boolean;
          "agent_saved_template"?: boolean;
          "decision_log"?: Json | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "name"?: string;
          "description"?: string | null;
          "schema"?: Json;
          "schema_version"?: number | null;
          "execution_mode"?: string | null;
          "is_active"?: boolean | null;
          "conflict_policy"?: string | null;
          "last_run_at"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "is_public"?: boolean;
          "tags"?: string[];
          "fork_count"?: number;
          "published_at"?: string | null;
          "public_author_name"?: string | null;
          "workspace_id"?: string;
          "visibility"?: string;
          "folder_id"?: string | null;
          "ai_use_case_category"?: string | null;
          "ai_act_risk_level"?: string;
          "customer_role"?: string;
          "human_oversight_required"?: boolean;
          "transparency_notice_required"?: boolean;
          "high_risk_documentation_required"?: boolean;
          "prohibited_reason"?: string | null;
          "reviewer"?: string | null;
          "reviewed_at"?: string | null;
          "ai_act_notes"?: string | null;
          "legal_review_override"?: boolean;
          "program_type"?: string;
          "agent_state"?: string | null;
          "agent_discard_after_run"?: boolean;
          "agent_saved_template"?: boolean;
          "decision_log"?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "programs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "workspace_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      "push_subscriptions": {
        Row: {
          "id": string;
          "user_id": string;
          "expo_token": string;
          "platform": string;
          "device_name": string | null;
          "enabled": boolean;
          "created_at": string;
          "last_seen_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "expo_token": string;
          "platform": string;
          "device_name"?: string | null;
          "enabled"?: boolean;
          "created_at"?: string;
          "last_seen_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "expo_token"?: string;
          "platform"?: string;
          "device_name"?: string | null;
          "enabled"?: boolean;
          "created_at"?: string;
          "last_seen_at"?: string;
        };
        Relationships: [];
      };
      "rate_limit_buckets": {
        Row: {
          "key": string;
          "count": number;
          "reset_at": string;
          "updated_at": string;
        };
        Insert: {
          "key": string;
          "count"?: number;
          "reset_at": string;
          "updated_at"?: string;
        };
        Update: {
          "key"?: string;
          "count"?: number;
          "reset_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
      };
      "redemption_codes": {
        Row: {
          "id": string;
          "code": string;
          "label": string | null;
          "type": string;
          "value": Json | null;
          "locked_to_email": string | null;
          "max_uses": number | null;
          "uses_count": number;
          "expires_at": string | null;
          "is_active": boolean;
          "created_by": string | null;
          "created_at": string | null;
        };
        Insert: {
          "id"?: string;
          "code": string;
          "label"?: string | null;
          "type": string;
          "value"?: Json | null;
          "locked_to_email"?: string | null;
          "max_uses"?: number | null;
          "uses_count"?: number;
          "expires_at"?: string | null;
          "is_active"?: boolean;
          "created_by"?: string | null;
          "created_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "code"?: string;
          "label"?: string | null;
          "type"?: string;
          "value"?: Json | null;
          "locked_to_email"?: string | null;
          "max_uses"?: number | null;
          "uses_count"?: number;
          "expires_at"?: string | null;
          "is_active"?: boolean;
          "created_by"?: string | null;
          "created_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "redemption_codes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "redemptions": {
        Row: {
          "id": string;
          "code_id": string;
          "user_id": string;
          "redeemed_at": string | null;
        };
        Insert: {
          "id"?: string;
          "code_id": string;
          "user_id": string;
          "redeemed_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "code_id"?: string;
          "user_id"?: string;
          "redeemed_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "redemptions_code_id_fkey";
            columns: ["code_id"];
            isOneToOne: false;
            referencedRelation: "redemption_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "redemptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "resource_locks": {
        Row: {
          "id": string;
          "resource_type": string;
          "resource_id": string;
          "locked_by_run_id": string | null;
          "acquired_at": string | null;
          "expires_at": string;
        };
        Insert: {
          "id"?: string;
          "resource_type": string;
          "resource_id": string;
          "locked_by_run_id"?: string | null;
          "acquired_at"?: string | null;
          "expires_at": string;
        };
        Update: {
          "id"?: string;
          "resource_type"?: string;
          "resource_id"?: string;
          "locked_by_run_id"?: string | null;
          "acquired_at"?: string | null;
          "expires_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resource_locks_locked_by_run_id_fkey";
            columns: ["locked_by_run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "runs": {
        Row: {
          "id": string;
          "program_id": string;
          "triggered_by": string;
          "trigger_payload": Json | null;
          "status": string | null;
          "started_at": string | null;
          "completed_at": string | null;
          "error_message": string | null;
          "created_at": string | null;
          "prompt_tokens": number;
          "completion_tokens": number;
          "total_tokens": number;
          "estimated_cost_usd": number;
          "connector_api_calls": number;
          "model_call_count": number;
          "user_id": string | null;
          "workflow_version": number | null;
          "trigger_source": string | null;
          "data_region": string | null;
          "policy_checks": Json | null;
          "block_warning_reasons": Json | null;
          "retention_expiry": string | null;
          "execution_mode": string | null;
          "reap_attempts": number;
          "last_reaped_at": string | null;
          "watcher_heartbeat_at": string | null;
          "parent_run_id": string | null;
          "llm_token_count": number;
          "node_execution_count": number;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "triggered_by": string;
          "trigger_payload"?: Json | null;
          "status"?: string | null;
          "started_at"?: string | null;
          "completed_at"?: string | null;
          "error_message"?: string | null;
          "created_at"?: string | null;
          "prompt_tokens"?: number;
          "completion_tokens"?: number;
          "total_tokens"?: number;
          "estimated_cost_usd"?: number;
          "connector_api_calls"?: number;
          "model_call_count"?: number;
          "user_id"?: string | null;
          "workflow_version"?: number | null;
          "trigger_source"?: string | null;
          "data_region"?: string | null;
          "policy_checks"?: Json | null;
          "block_warning_reasons"?: Json | null;
          "retention_expiry"?: string | null;
          "execution_mode"?: string | null;
          "reap_attempts"?: number;
          "last_reaped_at"?: string | null;
          "watcher_heartbeat_at"?: string | null;
          "parent_run_id"?: string | null;
          "llm_token_count"?: number;
          "node_execution_count"?: number;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "triggered_by"?: string;
          "trigger_payload"?: Json | null;
          "status"?: string | null;
          "started_at"?: string | null;
          "completed_at"?: string | null;
          "error_message"?: string | null;
          "created_at"?: string | null;
          "prompt_tokens"?: number;
          "completion_tokens"?: number;
          "total_tokens"?: number;
          "estimated_cost_usd"?: number;
          "connector_api_calls"?: number;
          "model_call_count"?: number;
          "user_id"?: string | null;
          "workflow_version"?: number | null;
          "trigger_source"?: string | null;
          "data_region"?: string | null;
          "policy_checks"?: Json | null;
          "block_warning_reasons"?: Json | null;
          "retention_expiry"?: string | null;
          "execution_mode"?: string | null;
          "reap_attempts"?: number;
          "last_reaped_at"?: string | null;
          "watcher_heartbeat_at"?: string | null;
          "parent_run_id"?: string | null;
          "llm_token_count"?: number;
          "node_execution_count"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "runs_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runs_parent_run_id_fkey";
            columns: ["parent_run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "secrets_health_events": {
        Row: {
          "id": string;
          "workspace_id": string | null;
          "connection_id": string | null;
          "event_type": string;
          "severity": string;
          "details": Json;
          "resolved_at": string | null;
          "created_at": string;
          "connection_provider": string | null;
        };
        Insert: {
          "id"?: string;
          "workspace_id"?: string | null;
          "connection_id"?: string | null;
          "event_type": string;
          "severity"?: string;
          "details": Json;
          "resolved_at"?: string | null;
          "created_at"?: string;
          "connection_provider"?: string | null;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string | null;
          "connection_id"?: string | null;
          "event_type"?: string;
          "severity"?: string;
          "details"?: Json;
          "resolved_at"?: string | null;
          "created_at"?: string;
          "connection_provider"?: string | null;
        };
        Relationships: [];
      };
      "security_events": {
        Row: {
          "id": string;
          "created_at": string;
          "event": string;
          "severity": string;
          "scope_type": string;
          "scope_id": string;
          "user_id": string | null;
          "details": Json | null;
          "action": string | null;
        };
        Insert: {
          "id"?: string;
          "created_at"?: string;
          "event": string;
          "severity"?: string;
          "scope_type": string;
          "scope_id": string;
          "user_id"?: string | null;
          "details"?: Json | null;
          "action"?: string | null;
        };
        Update: {
          "id"?: string;
          "created_at"?: string;
          "event"?: string;
          "severity"?: string;
          "scope_type"?: string;
          "scope_id"?: string;
          "user_id"?: string | null;
          "details"?: Json | null;
          "action"?: string | null;
        };
        Relationships: [];
      };
      "security_locks": {
        Row: {
          "id": string;
          "scope_type": string;
          "scope_id": string;
          "reason": string;
          "locked_by": string;
          "created_at": string;
          "expires_at": string | null;
          "released_at": string | null;
          "released_by": string | null;
        };
        Insert: {
          "id"?: string;
          "scope_type": string;
          "scope_id": string;
          "reason": string;
          "locked_by"?: string;
          "created_at"?: string;
          "expires_at"?: string | null;
          "released_at"?: string | null;
          "released_by"?: string | null;
        };
        Update: {
          "id"?: string;
          "scope_type"?: string;
          "scope_id"?: string;
          "reason"?: string;
          "locked_by"?: string;
          "created_at"?: string;
          "expires_at"?: string | null;
          "released_at"?: string | null;
          "released_by"?: string | null;
        };
        Relationships: [];
      };
      "support_access_grants": {
        Row: {
          "id": string;
          "user_id": string;
          "program_id": string;
          "ticket_id": string | null;
          "expires_at": string;
          "revoked_at": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "program_id": string;
          "ticket_id"?: string | null;
          "expires_at": string;
          "revoked_at"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "program_id"?: string;
          "ticket_id"?: string | null;
          "expires_at"?: string;
          "revoked_at"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_access_grants_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_access_grants_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      "support_messages": {
        Row: {
          "id": string;
          "ticket_id": string;
          "sender_type": string;
          "content": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "ticket_id": string;
          "sender_type": string;
          "content": string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "ticket_id"?: string;
          "sender_type"?: string;
          "content"?: string;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      "support_tickets": {
        Row: {
          "id": string;
          "user_id": string;
          "user_email": string;
          "user_tier": string;
          "type": string;
          "subject": string;
          "status": string;
          "created_at": string;
          "updated_at": string;
          "assigned_to": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "user_email": string;
          "user_tier"?: string;
          "type"?: string;
          "subject": string;
          "status"?: string;
          "created_at"?: string;
          "updated_at"?: string;
          "assigned_to"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "user_email"?: string;
          "user_tier"?: string;
          "type"?: string;
          "subject"?: string;
          "status"?: string;
          "created_at"?: string;
          "updated_at"?: string;
          "assigned_to"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "system_settings": {
        Row: {
          "key": string;
          "value": Json;
          "updated_at": string;
          "updated_by": string | null;
        };
        Insert: {
          "key": string;
          "value": Json;
          "updated_at"?: string;
          "updated_by"?: string | null;
        };
        Update: {
          "key"?: string;
          "value"?: Json;
          "updated_at"?: string;
          "updated_by"?: string | null;
        };
        Relationships: [];
      };
      "team_members": {
        Row: {
          "team_id": string;
          "user_id": string;
          "role": string;
          "invited_at": string;
        };
        Insert: {
          "team_id": string;
          "user_id": string;
          "role": string;
          "invited_at"?: string;
        };
        Update: {
          "team_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "invited_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      "teams": {
        Row: {
          "id": string;
          "name": string;
          "owner_id": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "owner_id": string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "owner_id"?: string;
          "created_at"?: string;
        };
        Relationships: [];
      };
      "templates": {
        Row: {
          "id": string;
          "name": string;
          "description": string;
          "category": string;
          "genesis_prompt": string;
          "program_json": Json;
          "thumbnail_url": string | null;
          "is_public": boolean;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
          "difficulty": string;
          "estimated_runtime": string;
          "required_connections": string[];
          "tags": string[];
          "fork_count": number | null;
          "status": string;
          "rejection_reason": string | null;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "description"?: string;
          "category"?: string;
          "genesis_prompt": string;
          "program_json": Json;
          "thumbnail_url"?: string | null;
          "is_public"?: boolean;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "difficulty"?: string;
          "estimated_runtime"?: string;
          "required_connections": string[];
          "tags": string[];
          "fork_count"?: number | null;
          "status"?: string;
          "rejection_reason"?: string | null;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "description"?: string;
          "category"?: string;
          "genesis_prompt"?: string;
          "program_json"?: Json;
          "thumbnail_url"?: string | null;
          "is_public"?: boolean;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "difficulty"?: string;
          "estimated_runtime"?: string;
          "required_connections"?: string[];
          "tags"?: string[];
          "fork_count"?: number | null;
          "status"?: string;
          "rejection_reason"?: string | null;
        };
        Relationships: [];
      };
      "test_firms": {
        Row: {
          "workspace_id": string;
          "label": string | null;
          "notes": string | null;
          "created_by": string | null;
          "created_at": string;
        };
        Insert: {
          "workspace_id": string;
          "label"?: string | null;
          "notes"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "workspace_id"?: string;
          "label"?: string | null;
          "notes"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_firms_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      "trigger_events": {
        Row: {
          "id": string;
          "trigger_id": string | null;
          "program_id": string;
          "run_id": string | null;
          "fired_at": string;
          "source": string;
          "status": string;
          "message": string | null;
          "payload": Json | null;
        };
        Insert: {
          "id"?: string;
          "trigger_id"?: string | null;
          "program_id": string;
          "run_id"?: string | null;
          "fired_at"?: string;
          "source": string;
          "status": string;
          "message"?: string | null;
          "payload"?: Json | null;
        };
        Update: {
          "id"?: string;
          "trigger_id"?: string | null;
          "program_id"?: string;
          "run_id"?: string | null;
          "fired_at"?: string;
          "source"?: string;
          "status"?: string;
          "message"?: string | null;
          "payload"?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "trigger_events_trigger_id_fkey";
            columns: ["trigger_id"];
            isOneToOne: false;
            referencedRelation: "triggers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trigger_events_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trigger_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "triggers": {
        Row: {
          "id": string;
          "program_id": string;
          "type": string;
          "config": Json;
          "is_active": boolean | null;
          "created_at": string | null;
          "webhook_token": string | null;
          "next_run_at": string | null;
          "last_fired_at": string | null;
          "updated_at": string | null;
        };
        Insert: {
          "id"?: string;
          "program_id": string;
          "type": string;
          "config": Json;
          "is_active"?: boolean | null;
          "created_at"?: string | null;
          "webhook_token"?: string | null;
          "next_run_at"?: string | null;
          "last_fired_at"?: string | null;
          "updated_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "program_id"?: string;
          "type"?: string;
          "config"?: Json;
          "is_active"?: boolean | null;
          "created_at"?: string | null;
          "webhook_token"?: string | null;
          "next_run_at"?: string | null;
          "last_fired_at"?: string | null;
          "updated_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "triggers_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      "two_factor_challenges": {
        Row: {
          "id": string;
          "user_id": string;
          "code_hash": string;
          "expires_at": string;
          "attempts": number;
          "consumed_at": string | null;
          "created_at": string;
          "channel": string;
          "approved_at": string | null;
          "denied_at": string | null;
          "approver_device_id": string | null;
          "requester_ip": string | null;
          "requester_label": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "code_hash": string;
          "expires_at": string;
          "attempts"?: number;
          "consumed_at"?: string | null;
          "created_at"?: string;
          "channel"?: string;
          "approved_at"?: string | null;
          "denied_at"?: string | null;
          "approver_device_id"?: string | null;
          "requester_ip"?: string | null;
          "requester_label"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "code_hash"?: string;
          "expires_at"?: string;
          "attempts"?: number;
          "consumed_at"?: string | null;
          "created_at"?: string;
          "channel"?: string;
          "approved_at"?: string | null;
          "denied_at"?: string | null;
          "approver_device_id"?: string | null;
          "requester_ip"?: string | null;
          "requester_label"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "two_factor_challenges_approver_device_id_fkey";
            columns: ["approver_device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
      "usage": {
        Row: {
          "id": string;
          "user_id": string;
          "org_id": string | null;
          "period_start": string;
          "period_end": string;
          "program_count": number | null;
          "execution_count": number | null;
          "connection_count": number | null;
          "created_at": string | null;
        };
        Insert: {
          "id"?: string;
          "user_id": string;
          "org_id"?: string | null;
          "period_start": string;
          "period_end": string;
          "program_count"?: number | null;
          "execution_count"?: number | null;
          "connection_count"?: number | null;
          "created_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "org_id"?: string | null;
          "period_start"?: string;
          "period_end"?: string;
          "program_count"?: number | null;
          "execution_count"?: number | null;
          "connection_count"?: number | null;
          "created_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "usage_records": {
        Row: {
          "id": string;
          "org_id": string;
          "run_id": string | null;
          "execution_minutes": number;
          "tokens_used": number;
          "model": string | null;
          "billing": string;
          "estimated_cost_usd": number;
          "billed_amount": number;
          "recorded_at": string;
        };
        Insert: {
          "id"?: string;
          "org_id": string;
          "run_id"?: string | null;
          "execution_minutes"?: number;
          "tokens_used"?: number;
          "model"?: string | null;
          "billing"?: string;
          "estimated_cost_usd"?: number;
          "billed_amount"?: number;
          "recorded_at"?: string;
        };
        Update: {
          "id"?: string;
          "org_id"?: string;
          "run_id"?: string | null;
          "execution_minutes"?: number;
          "tokens_used"?: number;
          "model"?: string | null;
          "billing"?: string;
          "estimated_cost_usd"?: number;
          "billed_amount"?: number;
          "recorded_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_records_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_records_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      "webhook_deliveries": {
        Row: {
          "source": string;
          "delivery_id": string;
          "first_seen_at": string;
          "expires_at": string;
        };
        Insert: {
          "source": string;
          "delivery_id": string;
          "first_seen_at"?: string;
          "expires_at": string;
        };
        Update: {
          "source"?: string;
          "delivery_id"?: string;
          "first_seen_at"?: string;
          "expires_at"?: string;
        };
        Relationships: [];
      };
      "webhook_endpoints": {
        Row: {
          "id": string;
          "trigger_id": string;
          "program_id": string;
          "user_id": string;
          "workspace_id": string | null;
          "name": string;
          "signing_secret": string;
          "signature_header": string | null;
          "timestamp_header": string | null;
          "signature_prefix": string | null;
          "allowed_methods": string[] | null;
          "is_active": boolean | null;
          "created_at": string | null;
          "updated_at": string | null;
        };
        Insert: {
          "id"?: string;
          "trigger_id": string;
          "program_id": string;
          "user_id": string;
          "workspace_id"?: string | null;
          "name"?: string;
          "signing_secret": string;
          "signature_header"?: string | null;
          "timestamp_header"?: string | null;
          "signature_prefix"?: string | null;
          "allowed_methods"?: string[] | null;
          "is_active"?: boolean | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "trigger_id"?: string;
          "program_id"?: string;
          "user_id"?: string;
          "workspace_id"?: string | null;
          "name"?: string;
          "signing_secret"?: string;
          "signature_header"?: string | null;
          "timestamp_header"?: string | null;
          "signature_prefix"?: string | null;
          "allowed_methods"?: string[] | null;
          "is_active"?: boolean | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_trigger_id_fkey";
            columns: ["trigger_id"];
            isOneToOne: false;
            referencedRelation: "triggers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_endpoints_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_endpoints_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "workspace_env_vars": {
        Row: {
          "id": string;
          "workspace_id": string;
          "name": string;
          "vault_secret_id": string;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "name": string;
          "vault_secret_id": string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "name"?: string;
          "vault_secret_id"?: string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_env_vars_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_env_vars_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "workspace_folders": {
        Row: {
          "id": string;
          "workspace_id": string;
          "name": string;
          "color": string | null;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "name": string;
          "color"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "name"?: string;
          "color"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_folders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_folders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "workspace_invitations": {
        Row: {
          "id": string;
          "workspace_id": string;
          "email": string;
          "role": string;
          "invited_by": string | null;
          "accepted_by": string | null;
          "accepted_at": string | null;
          "revoked_at": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "workspace_id": string;
          "email": string;
          "role": string;
          "invited_by"?: string | null;
          "accepted_by"?: string | null;
          "accepted_at"?: string | null;
          "revoked_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "workspace_id"?: string;
          "email"?: string;
          "role"?: string;
          "invited_by"?: string | null;
          "accepted_by"?: string | null;
          "accepted_at"?: string | null;
          "revoked_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "workspace_memberships": {
        Row: {
          "workspace_id": string;
          "user_id": string;
          "role": string;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "workspace_id": string;
          "user_id": string;
          "role": string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "workspace_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_memberships_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "workspaces": {
        Row: {
          "id": string;
          "name": string;
          "created_by": string | null;
          "created_at": string;
          "updated_at": string;
          "included_credits_reset_at": string;
          "logo_url": string | null;
          "description": string | null;
          "default_program_visibility": string;
          "members_can_create_programs": boolean;
          "default_execution_mode": string;
          "default_conflict_policy": string;
          "compliance_mode": string;
          "execution_log_retention_days": number;
          "prompt_retention_days": number;
          "output_retention_days": number;
          "approval_record_retention_days": number;
          "secret_rotation_reminder_days": number;
          "store_full_prompts": boolean;
          "store_full_outputs": boolean;
          "data_region": string;
          "dpa_acknowledged_providers": string[];
          "purchased_credits": number;
          "included_credits_used": number;
          "allow_external_agents": boolean;
          "agent_min_role": string;
          "pii_mode": string;
          "bulk_write_approval_threshold": number;
          "tier": string;
          "plan_expires_at": string | null;
          "bonus_runs": number;
          "is_beta_tester": boolean;
          "genesis_uses_this_month": number;
          "genesis_month_reset_at": string | null;
          "stripe_customer_id": string | null;
          "stripe_subscription_id": string | null;
          "bonus_genesis_uses": number;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "included_credits_reset_at"?: string;
          "logo_url"?: string | null;
          "description"?: string | null;
          "default_program_visibility"?: string;
          "members_can_create_programs"?: boolean;
          "default_execution_mode"?: string;
          "default_conflict_policy"?: string;
          "compliance_mode"?: string;
          "execution_log_retention_days"?: number;
          "prompt_retention_days"?: number;
          "output_retention_days"?: number;
          "approval_record_retention_days"?: number;
          "secret_rotation_reminder_days"?: number;
          "store_full_prompts"?: boolean;
          "store_full_outputs"?: boolean;
          "data_region"?: string;
          "dpa_acknowledged_providers": string[];
          "purchased_credits"?: number;
          "included_credits_used"?: number;
          "allow_external_agents"?: boolean;
          "agent_min_role"?: string;
          "pii_mode"?: string;
          "bulk_write_approval_threshold"?: number;
          "tier"?: string;
          "plan_expires_at"?: string | null;
          "bonus_runs"?: number;
          "is_beta_tester"?: boolean;
          "genesis_uses_this_month"?: number;
          "genesis_month_reset_at"?: string | null;
          "stripe_customer_id"?: string | null;
          "stripe_subscription_id"?: string | null;
          "bonus_genesis_uses"?: number;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "created_by"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "included_credits_reset_at"?: string;
          "logo_url"?: string | null;
          "description"?: string | null;
          "default_program_visibility"?: string;
          "members_can_create_programs"?: boolean;
          "default_execution_mode"?: string;
          "default_conflict_policy"?: string;
          "compliance_mode"?: string;
          "execution_log_retention_days"?: number;
          "prompt_retention_days"?: number;
          "output_retention_days"?: number;
          "approval_record_retention_days"?: number;
          "secret_rotation_reminder_days"?: number;
          "store_full_prompts"?: boolean;
          "store_full_outputs"?: boolean;
          "data_region"?: string;
          "dpa_acknowledged_providers"?: string[];
          "purchased_credits"?: number;
          "included_credits_used"?: number;
          "allow_external_agents"?: boolean;
          "agent_min_role"?: string;
          "pii_mode"?: string;
          "bulk_write_approval_threshold"?: number;
          "tier"?: string;
          "plan_expires_at"?: string | null;
          "bonus_runs"?: number;
          "is_beta_tester"?: boolean;
          "genesis_uses_this_month"?: number;
          "genesis_month_reset_at"?: string | null;
          "stripe_customer_id"?: string | null;
          "stripe_subscription_id"?: string | null;
          "bonus_genesis_uses"?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      daily_llm_costs: {
        Row: {
          user_id: string | null;
          date: string | null;
          total_cost: number | null;
          total_tokens: number | null;
          request_count: number | null;
        };
        // Required: postgrest-js GenericView demands Relationships on every
        // view. Without it Views fails Record<string, GenericView>, so
        // Database['public'] no longer extends GenericSchema, the client's
        // Schema generic resolves to `never`, and EVERY .from().select() on
        // EVERY table types as never.
        Relationships: [];
      };
    };
    Functions: {
      admin_dead_letter_stats: {
        Args: {
          program_id?: string;
        };
        Returns: Json;
      };
      admin_llm_daily_series: {
        Args: {
          since: string;
        };
        Returns: Json;
      };
      admin_llm_finance_summary: {
        Args: {
          since: string;
        };
        Returns: Json;
      };
      admin_llm_model_spread: {
        Args: {
          since: string;
        };
        Returns: Json;
      };
      admin_llm_top_users: {
        Args: {
          max_rows?: number;
          since: string;
        };
        Returns: Json;
      };
      admin_purge_old_dead_letters: {
        Args: {
          older_than_days?: number;
          program_id?: string;
        };
        Returns: Json;
      };
      admin_resolve_dead_letter: {
        Args: {
          entry_id: string;
          resolution_note?: string;
        };
        Returns: Json;
      };
      admin_retrigger_dead_letter: {
        Args: {
          entry_id: string;
          new_run_id?: string;
        };
        Returns: Json;
      };
      admin_search_users: {
        Args: {
          p_limit?: number;
          p_query: string;
        };
        Returns: Json;
      };
      apply_credit_purchase: {
        Args: {
          p_amount_credits: number;
          p_price_usd: number;
          p_stripe_payment_intent_id: string;
          p_stripe_session_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      apply_security_lock: {
        Args: {
          p_locked_by: string;
          p_reason: string;
          p_scope_id: string;
          p_scope_type: string;
          p_ttl_seconds: number;
        };
        Returns: Json;
      };
      can_edit_program: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      can_manage_org: {
        Args: {
          p_org_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      can_manage_workspace: {
        Args: {
          p_user_id?: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      can_run_program: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      can_view_program: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      check_rate_limit: {
        Args: {
          p_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: Json;
      };
      deduct_user_credits_raw: {
        Args: {
          p_amount: number;
          p_included_limit: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      ensure_org_subscription: {
        Args: {
          p_org_id: string;
        };
        Returns: Json;
      };
      generate_webhook_signing_secret: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_audit_stats: {
        Args: {
          p_days?: number;
          p_workspace_id?: string;
        };
        Returns: Json;
      };
      increment_fork_count: {
        Args: {
          program_id: string;
        };
        Returns: Json;
      };
      is_org_member: {
        Args: {
          p_org_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      is_org_owner: {
        Args: {
          p_org_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      is_security_locked: {
        Args: {
          p_scope_id: string;
          p_scope_type: string;
        };
        Returns: Json;
      };
      is_team_admin: {
        Args: {
          p_team_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      is_team_member: {
        Args: {
          p_team_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      is_workspace_contributor: {
        Args: {
          p_user_id?: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      is_workspace_member: {
        Args: {
          p_user_id?: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      match_agent_knowledge_chunks: {
        Args: {
          match_count?: number;
          query_embedding: string;
          target_workspace_ids: Json[];
        };
        Returns: Json;
      };
      program_access_role: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      program_analytics_summary: {
        Args: {
          p_program_id: string;
        };
        Returns: Json;
      };
      program_cost_by_node_type: {
        Args: {
          p_program_id: string;
        };
        Returns: Json;
      };
      program_cost_trend: {
        Args: {
          p_limit?: number;
          p_program_id: string;
        };
        Returns: Json;
      };
      program_model_comparison: {
        Args: {
          p_program_id: string;
        };
        Returns: Json;
      };
      program_token_usage_summary: {
        Args: {
          p_program_id: string;
        };
        Returns: Json;
      };
      purge_expired_operational_data: {
        Args: {
          p_app_log_retention?: string;
          p_audit_retention?: string;
          p_payload_retention?: string;
          p_run_retention?: string;
        };
        Returns: Json;
      };
      query_admin_audit_logs: {
        Args: {
          p_action?: string;
          p_actor_id?: string;
          p_date_from?: string;
          p_date_to?: string;
          p_limit?: number;
          p_offset?: number;
          p_risk_level?: string;
          p_sort_by?: string;
          p_sort_order?: string;
          p_success?: boolean;
          p_target_id?: string;
          p_target_type?: string;
          p_workspace_id?: string;
        };
        Returns: Json;
      };
      record_admin_audit_log: {
        Args: {
          p_action: string;
          p_actor_email: string;
          p_actor_id: string;
          p_actor_ip: string;
          p_actor_role: string;
          p_actor_user_agent: string;
          p_affected_resources: Json[];
          p_correlation_id: string;
          p_data_subject_ids: Json[];
          p_error_message: string;
          p_id: string;
          p_ip_address: string;
          p_legal_basis: string;
          p_metadata: Json;
          p_reason: string;
          p_referer: string;
          p_request_id: string;
          p_retention_category: string;
          p_retention_days: number;
          p_risk_level: string;
          p_session_id: string;
          p_success: boolean;
          p_target_id: string;
          p_target_identifier: string;
          p_target_type: string;
          p_timestamp: string;
          p_user_agent: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      record_security_event: {
        Args: {
          p_action: string;
          p_details: Json;
          p_event: string;
          p_scope_id: string;
          p_scope_type: string;
          p_severity: string;
          p_user_id: string;
          p_window_seconds: number;
        };
        Returns: Json;
      };
      redeem_code_atomic: {
        Args: {
          p_code: string;
          p_user_email: string;
          p_user_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      release_security_lock: {
        Args: {
          p_released_by: string;
          p_scope_id: string;
          p_scope_type: string;
        };
        Returns: Json;
      };
      rls_auto_enable: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      top_up_user_credits: {
        Args: {
          p_amount_credits: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      user_can_access_shared_program: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      user_can_review_program: {
        Args: {
          p_program_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      vault_delete_secret: {
        Args: {
          p_secret_id: string;
        };
        Returns: Json;
      };
      vault_retrieve_secret: {
        Args: {
          p_secret_id: string;
        };
        Returns: Json;
      };
      vault_store_secret: {
        Args: {
          p_description?: string;
          p_name: string;
          p_secret: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
