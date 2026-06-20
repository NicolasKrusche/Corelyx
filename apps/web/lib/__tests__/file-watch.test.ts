import { describe, it, expect } from "vitest";
import { matchesAnyPattern } from "@/lib/triggers/file-watch";

describe("matchesAnyPattern", () => {
  it("matches any file when no patterns are configured", () => {
    expect(matchesAnyPattern([], "anything.xyz")).toBe(true);
    expect(matchesAnyPattern([], "")).toBe(true);
  });

  it("matches a simple extension glob", () => {
    expect(matchesAnyPattern(["*.pdf"], "invoice.pdf")).toBe(true);
    expect(matchesAnyPattern(["*.pdf"], "invoice.txt")).toBe(false);
  });

  it("is case-insensitive (desktop filesystem behaviour)", () => {
    expect(matchesAnyPattern(["*.PDF"], "report.pdf")).toBe(true);
    expect(matchesAnyPattern(["*.pdf"], "REPORT.PDF")).toBe(true);
  });

  it("supports prefix globs", () => {
    expect(matchesAnyPattern(["invoice-*.csv"], "invoice-2024.csv")).toBe(true);
    expect(matchesAnyPattern(["invoice-*.csv"], "receipt-2024.csv")).toBe(false);
  });

  it("treats ? as exactly one character", () => {
    expect(matchesAnyPattern(["page-?.png"], "page-1.png")).toBe(true);
    expect(matchesAnyPattern(["page-?.png"], "page-12.png")).toBe(false);
  });

  it("escapes regex metacharacters so the dot is literal", () => {
    expect(matchesAnyPattern(["a.b"], "a.b")).toBe(true);
    expect(matchesAnyPattern(["a.b"], "axb")).toBe(false);
  });

  it("matches if any pattern in the list matches", () => {
    expect(matchesAnyPattern(["*.pdf", "*.csv"], "data.csv")).toBe(true);
    expect(matchesAnyPattern(["*.pdf", "*.csv"], "data.json")).toBe(false);
  });

  it("anchors the whole name (no partial matches)", () => {
    expect(matchesAnyPattern(["*.pdf"], "evil.pdf.exe")).toBe(false);
    expect(matchesAnyPattern(["report"], "report.pdf")).toBe(false);
  });

  it("a glob does not cross a path separator", () => {
    // patterns match the basename only; a literal slash in the name can't be
    // swallowed by *, so a crafted name can't escape the intended match.
    expect(matchesAnyPattern(["*.pdf"], "sub/evil.pdf")).toBe(false);
  });
});
