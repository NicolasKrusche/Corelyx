/**
 * Secret Rotation Automation
 * Rotates critical secrets (API keys, tokens, credentials) on a 90-day schedule
 * Integrates with secret management systems (Vault, AWS Secrets Manager, etc.)
 */

export type SecretMetadata = {
  name: string;
  description: string;
  lastRotated: string; // ISO timestamp
  rotationIntervalDays: number;
  nextRotationDue: string; // ISO timestamp
  isCritical: boolean;
  currentValue?: string; // Only in memory, never stored
};

export type SecretRotationConfig = {
  secrets: Record<string, SecretMetadata>;
  rotationIntervalDays: number; // Default 90 days
};

/**
 * Default configuration for critical secrets that require 90-day rotation
 */
export const DEFAULT_SECRET_ROTATION_CONFIG: SecretRotationConfig = {
  rotationIntervalDays: 90,
  secrets: {
    // Example secrets - replace with actual secrets in your environment
    'supabase-service-role': {
      name: 'supabase-service-role',
      description: 'Supabase service role key for backend operations',
      lastRotated: new Date().toISOString(),
      rotationIntervalDays: 90,
      nextRotationDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isCritical: true,
    },
    'encryption-key': {
      name: 'encryption-key',
      description: 'Primary encryption key for PII data at rest',
      lastRotated: new Date().toISOString(),
      rotationIntervalDays: 90,
      nextRotationDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isCritical: true,
    },
    'webhook-signing-secret': {
      name: 'webhook-signing-secret',
      description: 'Secret used to sign and verify webhook signatures',
      lastRotated: new Date().toISOString(),
      rotationIntervalDays: 90,
      nextRotationDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isCritical: true,
    },
    'external-api-key': {
      name: 'external-api-key',
      description: 'API key for external service integrations',
      lastRotated: new Date().toISOString(),
      rotationIntervalDays: 90,
      nextRotationDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isCritical: true,
    },
  },
};

/**
 * Check if a secret is due for rotation
 * @param secret - Secret metadata to check
 * @returns true if secret is due or overdue for rotation
 */
export function isSecretDueForRotation(secret: SecretMetadata): boolean {
  const nextRotation = new Date(secret.nextRotationDue);
  const now = new Date();
  return now >= nextRotation;
}

/**
 * Get list of secrets that are due for rotation
 * @param config - Secret rotation configuration
 * @returns Array of secret names that need rotation
 */
export function getSecretsDueForRotation(config: SecretRotationConfig = DEFAULT_SECRET_ROTATION_CONFIG): string[] {
  return Object.entries(config.secrets)
    .filter(([, secret]) => isSecretDueForRotation(secret))
    .map(([name]) => name);
}

/**
 * Rotate a single secret
 * @param secretName - Name of the secret to rotate
 * @param config - Secret rotation configuration
 * @returns New secret value and updated metadata
 * 
 * NOTE: This is a stub implementation. In production, integrate with your secret manager:
 * - AWS Secrets Manager
 * - HashiCorp Vault
 * - Azure Key Vault
 * - GCP Secret Manager
 * - Or custom Supabase function
 */
export async function rotateSecret(
  secretName: string,
  config: SecretRotationConfig = DEFAULT_SECRET_ROTATION_CONFIG
): Promise<{ newValue: string; updatedMetadata: SecretMetadata }> {
  const secret = config.secrets[secretName];
  if (!secret) {
    throw new Error(`Secret ${secretName} not found in configuration`);
  }

  // Generate new secret value (in production, use cryptographically secure random)
  const newValue = generateSecretValue(secret.name);

  // Update metadata
  const now = new Date();
  const updatedMetadata: SecretMetadata = {
    ...secret,
    lastRotated: now.toISOString(),
    nextRotationDue: new Date(now.getTime() + secret.rotationIntervalDays * 24 * 60 * 60 * 1000).toISOString(),
  };

  // In production, you would:
  // 1. Store the new secret in your secret manager
  // 2. Update any applications/services that use this secret
  // 3. Optionally invalidate the old secret after a grace period

  // For now, we just return the new value and updated metadata
  // The actual secret storage update should be handled by the caller
  return {
    newValue,
    updatedMetadata,
  };
}

/**
 * Generate a cryptographically secure random secret
 * @param purpose - Description of what the secret is for (used for logging)
 * @returns Random string suitable for use as a secret
 */
function generateSecretValue(purpose: string): string {
  // Generate a 32-byte hex string (256 bits of entropy)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Rotate all secrets that are due for rotation
 * @param config - Secret rotation configuration
 * @returns Results of rotation attempts
 */
export async function rotateDueSecrets(
  config: SecretRotationConfig = DEFAULT_SECRET_ROTATION_CONFIG
): Promise<{
  rotated: string[];
  failed: Array<{ secret: string; error: string }>;
  updatedConfig: SecretRotationConfig;
}> {
  const dueSecrets = getSecretsDueForRotation(config);
  const rotated: string[] = [];
  const failed: Array<{ secret: string; error: string }> = [];

  // Update the config with latest secrets (we'll update after each rotation)
  const updatedConfig = { ...config, secrets: { ...config.secrets } };

  for (const secretName of dueSecrets) {
    try {
      const result = await rotateSecret(secretName, updatedConfig);
      // Update the secret in our config
      updatedConfig.secrets[secretName] = result.updatedMetadata;
      rotated.push(secretName);
      // In production, you would also persist the new secret to your secret manager here
    } catch (error) {
      failed.push({
        secret: secretName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    rotated,
    failed,
    updatedConfig,
  };
}

/**
 * Get the next rotation date for a secret
 * @param secret - Secret metadata
 * @returns Date when the secret should next be rotated
 */
export function getNextRotationDate(secret: SecretMetadata): Date {
  return new Date(secret.nextRotationDue);
}

/**
 * Get time until next rotation in days
 * @param secret - Secret metadata
 * @returns Days until rotation is due (negative if overdue)
 */
export function daysUntilRotation(secret: SecretMetadata): number {
  const nextRotation = new Date(secret.nextRotationDue);
  const now = new Date();
  return Math.ceil((nextRotation.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}