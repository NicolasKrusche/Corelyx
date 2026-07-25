// Auto-generated from the deployed Supabase PostgREST OpenAPI schema.
// Run pnpm --filter @flowos/db gen:types:rest after applying migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
          "node_config"?: Json;
          "input_data"?: Json;
          "error_message": string;
          "error_type": string;
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
        Relationships: [];
      };
      "organizations": {
        Row: {
          "id": string;
          "name": string;
          "slug": string;
          "owner_id": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "name": string;
          "slug": string;
          "owner_id": string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "slug"?: string;
          "owner_id"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [];
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
          "features"?: Json;
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
        Relationships: [];
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
          "factors"?: Json;
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
        Relationships: [];
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
        Relationships: [];
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
          "user_id": string | null;
          "fork_count": number | null;
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
          "user_id"?: string | null;
          "fork_count"?: number | null;
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
          "user_id"?: string | null;
          "fork_count"?: number | null;
        };
        Relationships: [];
      };
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        };
        Relationships: [];
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
        Relationships: [];
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
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
      };
    };
    Functions: {
      get_daily_llm_cost: {
        Args: {
          target_date: string;
        };
        Returns: number;
      };
      cleanup_expired_credential_locks: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      increment_fork_count: {
        Args: {
          program_id: string;
        };
        Returns: undefined;
      };
      purge_expired_operational_data: {
        Args: {
          p_payload_retention?: string;
          p_run_retention?: string;
          p_audit_retention?: string;
        };
        Returns: Json;
      };
      check_rate_limit: {
        Args: {
          p_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      redeem_code_atomic: {
        Args: {
          p_code: string;
          p_user_id: string;
          p_workspace_id: string;
          p_user_email: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
}
