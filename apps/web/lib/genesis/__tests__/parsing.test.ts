import { describe, expect, it } from "vitest";
import { jsonrepair } from "jsonrepair";
import { extractJson } from "../parsing";

describe("extractJson", () => {
  it("removes trailing model commentary from a direct JSON response", () => {
    expect(JSON.parse(extractJson('{"program_name":"Spam Email Deletion","nodes":[]} Done.'))).toEqual({
      program_name: "Spam Email Deletion",
      nodes: [],
    });
  });

  it("extracts fenced JSON with surrounding commentary", () => {
    expect(extractJson('Here is the workflow:\n```json\n{"nodes":[]}\n```\nReady to use.')).toBe('{"nodes":[]}');
  });

  it("ignores braces inside JSON strings", () => {
    expect(extractJson('{"template":"Use {{email.id}} and \\"}\\"","nodes":[]} trailing')).toBe(
      '{"template":"Use {{email.id}} and \\"}\\"","nodes":[]}'
    );
  });

  it("preserves incomplete JSON for jsonrepair recovery", () => {
    const extracted = extractJson('```json\n{"program_name":"Recovered","nodes":[');

    expect(JSON.parse(jsonrepair(extracted))).toEqual({
      program_name: "Recovered",
      nodes: [],
    });
  });
});
