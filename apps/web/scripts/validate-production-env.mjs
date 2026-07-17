const production =
  process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production";

if (!production) process.exit(0);

const required = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "LEGAL_ENTITY_NAME",
  "LEGAL_ADDRESS_LINE_1",
  "LEGAL_POSTAL_CODE",
  "LEGAL_CITY",
  "LEGAL_COUNTRY",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (
  !process.env.LEGAL_REPRESENTATIVE?.trim() &&
  !process.env.LEGAL_RESPONSIBLE_PERSON?.trim()
) {
  missing.push("LEGAL_REPRESENTATIVE (or LEGAL_RESPONSIBLE_PERSON)");
}

if (missing.length > 0) {
  console.error(
    `Refusing a production build with incomplete required configuration: ${missing.join(
      ", ",
    )}`,
  );
  process.exit(1);
}
