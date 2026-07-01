import { describe, it, expect } from "vitest";
import {
  recordsToCsv,
  recordsToExcelXml,
  toCsv,
  zipArchive,
} from "@/lib/compliance/export";
import type { AiSystemInventoryRecord } from "@/lib/compliance/governance";

function makeRecord(overrides: Partial<AiSystemInventoryRecord> = {}): AiSystemInventoryRecord {
  return {
    system_id: "sys_12345678",
    name: "Invoice triager",
    description: "Routes incoming invoices",
    department: "Finance",
    business_owner: "Ada Lovelace",
    technical_owner: "Alan Turing",
    purpose: "Accounts payable automation",
    models_used: ["claude-opus-4-8"],
    data_sources: ["Gmail", "Stripe"],
    personal_data_processed: "No",
    special_category_data_processed: "No",
    deployment_status: "Active",
    creation_date: "2026-06-01",
    last_review_date: "2026-06-20",
    ai_act_risk_level: null,
    risk_classification: "Unknown",
    has_approval_gate: true,
    human_oversight_status: "Human approval required",
    transparency_notice_required: false,
    high_risk_documentation_required: false,
    documentation_status: "Complete",
    dpia_status: "Not required",
    review_due: false,
    ...overrides,
  };
}

describe("recordsToCsv — formula injection (CWE-1236)", () => {
  it.each(["=", "+", "-", "@"])(
    "neutralizes a leading %s in a user-controlled field",
    (trigger) => {
      // No embedded quotes here so the assertion isn't confounded by CSV
      // quote-escaping (covered separately below).
      const payload = `${trigger}cmd|calc`;
      const csv = recordsToCsv([makeRecord({ name: payload })]);
      // The dangerous value is forced to text with a leading apostrophe…
      expect(csv).toContain(`"'${payload}"`);
      // …and never appears as a raw, evaluable cell.
      expect(csv).not.toContain(`"${payload}"`);
    }
  );

  it("neutralizes a leading tab and carriage return", () => {
    const csv = recordsToCsv([makeRecord({ name: "\t=evil" }), makeRecord({ description: "\r=evil" })]);
    expect(csv).toContain(`"'\t=evil"`);
    expect(csv).toContain(`"'\r=evil"`);
  });

  it("only the first character matters — a mid-cell = is left untouched", () => {
    const csv = recordsToCsv([makeRecord({ name: "Q3 total =sum" })]);
    expect(csv).toContain(`"Q3 total =sum"`);
  });

  it("leaves ordinary values and the header row unchanged", () => {
    const csv = recordsToCsv([makeRecord({ name: "Invoice triager" })]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      '"system_id","name","description","department","business_owner","technical_owner","purpose","models_used","data_sources","personal_data_processed","special_category_data_processed","deployment_status","creation_date","last_review_date","risk_classification","human_oversight_status","documentation_status","dpia_status","review_due"'
    );
    expect(row).toContain('"Invoice triager"');
    expect(row).toContain('"Gmail; Stripe"');
  });

  it("still escapes embedded double quotes", () => {
    const csv = recordsToCsv([makeRecord({ description: 'He said "hi"' })]);
    expect(csv).toContain('"He said ""hi"""');
  });
});

describe("toCsv — generic injection-safe builder", () => {
  it("neutralizes formula triggers and escapes quotes across arbitrary rows", () => {
    const csv = toCsv(["a", "b"], [["=SUM(A1)", 'say "hi"'], ["ok", "-1+1"]]);
    const [header, r1, r2] = csv.split("\n");
    expect(header).toBe('"a","b"');
    expect(r1).toBe('"\'=SUM(A1)","say ""hi"""');
    expect(r2).toBe('"ok","\'-1+1"');
  });
});

describe("XML exporters — control-char sanitization (invalid-XML guard)", () => {
  it("strips XML-illegal control chars from Excel output but keeps the text", () => {
    // A raw 0x00 / 0x08 in worksheet XML makes Excel refuse to open the file.
    const NUL = String.fromCharCode(0);
    const BS = String.fromCharCode(8);
    const xml = recordsToExcelXml([makeRecord({ name: "a" + NUL + "b" + BS + "c" })]);
    expect(xml.includes(NUL)).toBe(false);
    expect(xml.includes(BS)).toBe(false);
    expect(xml).toContain("abc");
  });

  it("preserves legal whitespace (tab is valid XML 1.0)", () => {
    const xml = recordsToExcelXml([makeRecord({ name: "keep	me" })]);
    expect(xml).toContain("keep	me");
  });
});

describe("zipArchive — dependency-free ZIP writer", () => {
  it("writes a valid stored archive with text and binary entries", () => {
    const zip = zipArchive([
      { name: "hello.txt", content: "hi there" },
      { name: "bin.dat", content: Buffer.from([0x00, 0x01, 0x02]) },
    ]);
    // Local file header signature (PK\x03\x04) at the start…
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // …end-of-central-directory record present…
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    // …and both entry names are stored.
    expect(zip.includes(Buffer.from("hello.txt"))).toBe(true);
    expect(zip.includes(Buffer.from("bin.dat"))).toBe(true);
  });
});
