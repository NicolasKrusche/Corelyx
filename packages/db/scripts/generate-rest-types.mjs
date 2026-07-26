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
// Views stays hand-maintained (PostgREST does not distinguish views in its
// OpenAPI output), but everything from Functions on is regenerated below.
const viewsEnd = existing.indexOf("    Functions:", tailStart);
if (viewsEnd < 0) throw new Error("Could not find the Functions section");
const preservedViews = existing.slice(tailStart, viewsEnd);

// ── Foreign keys ────────────────────────────────────────────────────────────
// PostgREST annotates FK columns in each property's description, e.g.
//   "This is a Foreign Key to `connections.id`.<fk table='connections' column='id'/>"
// Relationships must be populated or embedded selects — .select("connections(...)")
// — resolve to SelectQueryError instead of the joined row type.
function relationshipsFor(name, definition) {
  const fks = [];
  for (const [column, prop] of Object.entries(definition.properties || {})) {
    const m = /<fk table='([^']+)' column='([^']+)'\/>/.exec(prop.description || "");
    if (m) fks.push({ column, table: m[1], ref: m[2] });
  }
  if (fks.length === 0) return ["        Relationships: [];"];
  return [
    "        Relationships: [",
    ...fks.flatMap(({ column, table, ref }) => [
      "          {",
      `            foreignKeyName: ${JSON.stringify(`${name}_${column}_fkey`)};`,
      `            columns: [${JSON.stringify(column)}];`,
      "            isOneToOne: false;",
      `            referencedRelation: ${JSON.stringify(table)};`,
      `            referencedColumns: [${JSON.stringify(ref)}];`,
      "          },",
    ]),
    "        ];",
  ];
}

// ── Functions ───────────────────────────────────────────────────────────────
// Previously hand-maintained and badly drifted: 6 of 21 RPCs the app calls were
// declared, so every other .rpc("...") failed the name union. Generated from the
// live /rpc/ paths instead. PostgREST does not publish return types, so Returns
// is Json and callers narrow as they already do.
function argType(schema = {}) {
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "string") return "string";
  if (schema.type === "array") return "Json[]";
  return "Json";
}
const functionLines = Object.entries(document.paths || {})
  .filter(([path]) => path.startsWith("/rpc/"))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, spec]) => {
    const name = path.slice("/rpc/".length);
    const body = (spec.post?.parameters || []).find((p) => p.name === "args");
    const props = body?.schema?.properties || {};
    const required = new Set(body?.schema?.required || []);
    const keys = Object.keys(props).sort();
    if (keys.length === 0) {
      return `      ${name}: {\n        Args: Record<PropertyKey, never>;\n        Returns: Json;\n      };`;
    }
    const args = keys
      .map((k) => `          ${k}${required.has(k) ? "" : "?"}: ${argType(props[k])};`)
      .join("\n");
    return `      ${name}: {\n        Args: {\n${args}\n        };\n        Returns: Json;\n      };`;
  })
  .join("\n");

const preservedTail = `${preservedViews}    Functions: {\n${functionLines}\n    };\n    Enums: Record<string, never>;\n    CompositeTypes: Record<string, never>;\n  };\n}\n`;

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
      ...relationshipsFor(name, definition),
      "      };",
    ].join("\n");
  })
  .join("\n");

const header = `// Auto-generated from the deployed Supabase PostgREST OpenAPI schema.\n// Run pnpm --filter @flowos/db gen:types:rest after applying migrations.\n\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\nexport type Database = {\n  public: {\n    Tables: {\n${tables}\n    };\n`;

await writeFile(outputPath, `${header}${preservedTail}`, "utf8");
console.log(`Generated types for ${definitions.length} public tables.`);
