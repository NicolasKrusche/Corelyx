import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "src", "database.types.ts");
const supabaseUrl = (
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required",
  );
}

const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    accept: "application/openapi+json",
  },
});
if (!response.ok) {
  throw new Error(`Supabase OpenAPI request failed with HTTP ${response.status}`);
}

const document = await response.json();
const definitions = Object.entries(document.definitions || {}).sort(([a], [b]) =>
  a.localeCompare(b),
);
if (definitions.length < 50) {
  throw new Error(
    `Refusing to replace database types from an incomplete schema (${definitions.length} tables)`,
  );
}

const existing = await readFile(outputPath, "utf8");
const tailStart = existing.indexOf("    Views:");
if (tailStart < 0) throw new Error("Could not find the Views section to preserve");
const preservedTail = existing.slice(tailStart);

function schemaType(schema = {}) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (schema.type === "array") {
    const item = schemaType(schema.items || {});
    return item.includes(" | ") ? `(${item})[]` : `${item}[]`;
  }
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "string") return "string";
  return "Json";
}

function propertyLines(properties, required, mode) {
  return Object.entries(properties).map(([name, schema]) => {
    const rowRequired = required.has(name);
    const hasDefault = Object.prototype.hasOwnProperty.call(schema, "default");
    const optional = mode === "update" || (mode === "insert" && (!rowRequired || hasDefault));
    const nullable = !rowRequired;
    return `          ${JSON.stringify(name)}${optional ? "?" : ""}: ${schemaType(schema)}${
      nullable ? " | null" : ""
    };`;
  });
}

const tables = definitions
  .map(([name, definition]) => {
    const properties = definition.properties || {};
    const required = new Set(definition.required || []);
    return [
      `      ${JSON.stringify(name)}: {`,
      "        Row: {",
      ...propertyLines(properties, required, "row"),
      "        };",
      "        Insert: {",
      ...propertyLines(properties, required, "insert"),
      "        };",
      "        Update: {",
      ...propertyLines(properties, required, "update"),
      "        };",
      "        Relationships: [];",
      "      };",
    ].join("\n");
  })
  .join("\n");

const header = `// Auto-generated from the deployed Supabase PostgREST OpenAPI schema.\n// Run pnpm --filter @flowos/db gen:types:rest after applying migrations.\n\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\nexport interface Database {\n  public: {\n    Tables: {\n${tables}\n    };\n`;

await writeFile(outputPath, `${header}${preservedTail}`, "utf8");
console.log(`Generated types for ${definitions.length} public tables.`);
