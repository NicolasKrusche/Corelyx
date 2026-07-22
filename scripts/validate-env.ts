/**
 * Build-time environment validation for Vercel deployments.
 * Validates required environment variables before the build process.
 */

const requiredForAllEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const requiredForProduction = [
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'LEGAL_ENTITY_NAME',
  'LEGAL_ADDRESS_LINE_1',
  'LEGAL_POSTAL_CODE',
  'LEGAL_CITY',
  'LEGAL_COUNTRY',
];

// Helper to check if a string is non-empty after trimming
function isNonEmpty(str: string | undefined): boolean {
  return str?.trim() !== '';
}

// Collect all required variables based on environment
const isProduction =
  process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production';

const required = [...requiredForAllEnv];
if (isProduction) {
  required.push(...requiredForProduction);
}

const missing = required.filter((name) => !isNonEmpty(process.env[name]));

// Handle the special case for LEGAL_REPRESENTATIVE or LEGAL_RESPONSIBLE_PERSON
if (isProduction) {
  const legalRep = process.env.LEGAL_REPRESENTATIVE;
  const legalResp = process.env.LEGAL_RESPONSIBLE_PERSON;
  if (!isNonEmpty(legalRep) && !isNonEmpty(legalResp)) {
    missing.push('LEGAL_REPRESENTATIVE (or LEGAL_RESPONSIBLE_PERSON)');
  }
}

if (missing.length > 0) {
  console.error(
    `❌ Build failed: Missing required environment variables: ${missing.join(
      ', ',
    )}`,
  );
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set.');
  process.exit(0);
}