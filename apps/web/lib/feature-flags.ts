/**
 * Kill switch and maintenance mode controls.
 * 
 * Provides emergency stop functionality and feature flags
 * for gradual rollouts and incident response.
 */

/** Feature flag configuration */
export interface FeatureFlags {
  // Emergency controls
  emergencyMaintenanceMode: boolean;
  disableGenesisGeneration: boolean;
  disableWorkflowExecution: boolean;
  
  // Gradual rollouts
  enableNewConnectors: boolean;
  enableGenesisV2: boolean;
  enableAdvancedEditor: boolean;
  enableBulkOperations: boolean;
  
  // Safety limits
  maxConcurrentRunsPerUser: number;
  dailyRunQuotaPerUser: number;
  
  // Announcements
  globalBannerMessage: string | null;
  globalBannerType: "info" | "warning" | "error" | null;
}

/** Default feature flag values */
const DEFAULT_FLAGS: FeatureFlags = {
  emergencyMaintenanceMode: false,
  disableGenesisGeneration: false,
  disableWorkflowExecution: false,
  
  enableNewConnectors: false,
  enableGenesisV2: false,
  enableAdvancedEditor: false,
  enableBulkOperations: false,
  
  maxConcurrentRunsPerUser: 5,
  dailyRunQuotaPerUser: 100,
  
  globalBannerMessage: null,
  globalBannerType: null,
};

/** Parse feature flags from environment variables */
export function getFeatureFlags(): FeatureFlags {
  return {
    emergencyMaintenanceMode: process.env.EMERGENCY_MAINTENANCE_MODE === "true",
    disableGenesisGeneration: process.env.DISABLE_GENESIS_GENERATION === "true",
    disableWorkflowExecution: process.env.DISABLE_WORKFLOW_EXECUTION === "true",
    
    enableNewConnectors: process.env.ENABLE_NEW_CONNECTORS === "true",
    enableGenesisV2: process.env.ENABLE_GENESIS_V2 === "true",
    enableAdvancedEditor: true,
    enableBulkOperations: process.env.ENABLE_BULK_OPERATIONS === "true",
    
    maxConcurrentRunsPerUser: parseInt(
      process.env.MAX_CONCURRENT_RUNS_PER_USER || "5",
      10
    ),
    dailyRunQuotaPerUser: parseInt(
      process.env.DAILY_RUN_QUOTA_PER_USER || "100",
      10
    ),
    
    globalBannerMessage: process.env.GLOBAL_BANNER_MESSAGE || null,
    globalBannerType: (process.env.GLOBAL_BANNER_TYPE as FeatureFlags["globalBannerType"]) || null,
  };
}

/** Check if a specific feature is enabled */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  const value = flags[feature];
  return typeof value === "boolean" ? value : false;
}

/** Check if system is in maintenance mode */
export function isMaintenanceMode(): boolean {
  return getFeatureFlags().emergencyMaintenanceMode;
}

/** Get maintenance mode response */
export function getMaintenanceResponse(): {
  error: string;
  message: string;
  statusCode: number;
} {
  return {
    error: "SERVICE_UNAVAILABLE",
    message: 
      process.env.MAINTENANCE_MESSAGE || 
      "Corelyx is temporarily unavailable for maintenance. Please try again in a few minutes.",
    statusCode: 503,
  };
}

/** Check if Genesis generation is available */
export function isGenesisEnabled(): boolean {
  const flags = getFeatureFlags();
  return !flags.emergencyMaintenanceMode && !flags.disableGenesisGeneration;
}

/** Check if workflow execution is available */
export function isWorkflowExecutionEnabled(): boolean {
  const flags = getFeatureFlags();
  return !flags.emergencyMaintenanceMode && !flags.disableWorkflowExecution;
}

/** Runtime kill switch check for critical errors */
export class KillSwitch {
  private static triggered = false;
  private static reason: string | null = null;
  private static triggeredAt: Date | null = null;
  
  /** Trigger the kill switch */
  static trigger(reason: string): void {
    if (!KillSwitch.triggered) {
      KillSwitch.triggered = true;
      KillSwitch.reason = reason;
      KillSwitch.triggeredAt = new Date();
      
      console.error(`[KILL SWITCH] TRIGGERED: ${reason}`);
      
      // In production, this could also:
      // - Send PagerDuty alert
      // - Post to Slack
      // - Update status page
    }
  }
  
  /** Check if kill switch is active */
  static isActive(): boolean {
    return KillSwitch.triggered;
  }
  
  /** Get kill switch status */
  static getStatus(): {
    active: boolean;
    reason: string | null;
    triggeredAt: Date | null;
  } {
    return {
      active: KillSwitch.triggered,
      reason: KillSwitch.reason,
      triggeredAt: KillSwitch.triggeredAt,
    };
  }
  
  /** Reset kill switch (use with caution) */
  static reset(): void {
    KillSwitch.triggered = false;
    KillSwitch.reason = null;
    KillSwitch.triggeredAt = null;
  }
}
