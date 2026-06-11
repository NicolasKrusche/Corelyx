# Corelyx Site-Wide Audit Report

**Date:** 2026-06-11
**Tester:** OpenCode (Playwright MCP + Node.js HTTP)
**Scope:** Complete site navigation, API endpoints, forms, security, limits, and edge cases
**Status:** PROBLEMS DOCUMENTED ONLY - NO FIXES APPLIED

---

## 1. Executive Summary

The Corelyx Next.js application was tested comprehensively using Playwright browser automation and direct HTTP API calls. A total of **50+ pages** and **80+ API endpoints** were evaluated. The test uncovered **17 distinct issues** across security, UX, error handling, performance, and functional categories. No fixes were applied per instructions.

---

## 2. Critical Issues

### 2.1 XSS Input Not Sanitized in Forms
- **Severity:** High
- **Location:** `/login`, `/signup`, `/tools/ai-inventory-generator`, `/tools/dpia-generator`
- **Details:** Input fields accept raw `<script>alert(1)</script>` and `'; DROP TABLE users; --` strings without any client-side sanitization or validation. The raw values are preserved in the DOM input elements.
- **Test Evidence:**
  - Login email field accepted `<script>alert(1)</script>` without modification
  - Login password field accepted `'; DROP TABLE users; --` without modification
  - AI Inventory Generator inputs accepted `<script>alert(1)</script>` without modification
- **Risk:** While Next.js React may escape on render, the lack of client-side validation and the fact that raw strings are passed to server APIs creates a potential XSS/SQL injection surface if server-side escaping is insufficient.

### 2.2 React Hydration Mismatch on Tool Pages
- **Severity:** High
- **Location:** `/tools/ai-inventory-generator`, `/tools/ai-act-risk-classifier`, `/tools/dpia-generator`
- **Details:** Console shows multiple `Hydration failed because the server rendered text didn't match the client` errors. The mismatch occurs in the `ReportPreview` component where timestamps differ between server and client rendering (e.g., `...T16:28:53.691Z` vs `...T16:28:52.894Z`).
- **Root Cause:** The server renders `Date.now()` or `new Date()` at build/request time, while the client renders a different timestamp during hydration. This causes React to discard the entire server-rendered tree and re-render on the client, eliminating SSR performance benefits.
- **Test Evidence:**
  ```
  + {"...T16:28:53.691Z\n- last_review_date: null\n- ai_act_risk_level: null\n- risk_c..."}
  - {"...T16:28:52.894Z\n- last_review_date: null\n- ai_act_risk_level: null\n- risk_c..."}
  ```

### 2.3 Vercel Analytics Blocked by CSP
- **Severity:** Medium
- **Location:** All pages with `@vercel/analytics` enabled
- **Details:** The browser console shows repeated errors: `Loading the script 'https://va.vercel-scripts.com/v1/script.debug.js' violates the following Content Security Policy directive: "script-src 'self' 'nonce-...' 'unsafe-eval'"`.
- **Test Evidence:** 40+ identical console errors across page navigations
- **Impact:** Analytics tracking is completely broken on every page load. The `script-src` directive does not include `https://va.vercel-scripts.com`.

### 2.4 Password Reset Endpoint Leaks Information
- **Severity:** Medium
- **Location:** `/api/auth/reset-password`
- **Details:** Submitting a password reset request for any email (even non-existent) returns `{"ok":true}` with HTTP 200. This allows email enumeration and confirms the endpoint exists.
- **Test Evidence:**
  - Request: `POST /api/auth/reset-password` with `{"email":"test@test.com"}`
  - Response: `{"ok":true}` (HTTP 200)
- **Risk:** Attackers can enumerate valid user accounts and use the endpoint for unauthenticated spam/abuse.

---

## 3. Security Issues

### 3.1 No Input Length Limits on Login Fields
- **Severity:** Medium
- **Location:** `/login`, `/signup`
- **Details:** The login email field accepts 10,000+ characters without truncation or client-side validation. The login password field accepts similarly long strings.
- **Test Evidence:**
  - Login email accepted 10,009 characters
  - Login password accepted XSS/SQL strings without any validation
- **Risk:** Potential DoS if the server processes extremely long strings without limits.

### 3.2 No Client-Side Email Validation on Login
- **Severity:** Low
- **Location:** `/login`
- **Details:** The login form's submit button is enabled even when the email field contains an invalid email (e.g., `test`).
- **Test Evidence:** Filled email with `test` (no @domain), button was enabled
- **Risk:** Poor UX, unnecessary server requests for invalid input.

### 3.3 Webhook Endpoints Return 500 for Invalid Payloads
- **Severity:** Medium
- **Location:** `/api/webhooks/slack`, `/api/webhooks/github`, `/api/webhooks/gmail`
- **Details:** Sending empty POST bodies to webhook endpoints returns `500 Internal Server Error` instead of `400 Bad Request` or `401 Unauthorized`.
- **Test Evidence:**
  - `/api/webhooks/slack` POST `{}` -> `500 {"error":"Internal server error"}`
  - `/api/webhooks/github` POST `{}` -> `500 {"error":"Internal server error"}`
  - `/api/webhooks/gmail` POST `{}` -> `500 {"error":"Internal server error"}`
- **Risk:** 500 errors expose internal failures and don't distinguish between invalid signatures and malformed payloads. Attackers could use this to probe the endpoint.

### 3.4 Inngest Endpoint Returns 500
- **Severity:** Medium
- **Location:** `/api/inngest`
- **Details:** Both GET and POST requests return `{"code":"internal_server_error"}` with HTTP 500.
- **Test Evidence:**
  - GET `/api/inngest` -> `500 {"code":"internal_server_error"}`
  - POST `/api/inngest` -> `500 {"code":"internal_server_error"}`
- **Risk:** Internal server errors should not be exposed publicly. This endpoint may be failing silently.

---

## 4. UX and UI Issues

### 4.1 Duplicate Page Title Suffix
- **Severity:** Low
- **Location:** All `/tools/*` pages
- **Details:** Tool pages have duplicate product names in the title: `AI Act Risk Classifier | Corelyx | Corelyx`.
- **Test Evidence:**
  - `/tools/ai-act-risk-classifier` title: "AI Act Risk Classifier | Corelyx | Corelyx"
  - `/tools/ai-inventory-generator` title: "AI Inventory Generator | Corelyx | Corelyx"
  - `/tools/dpia-generator` title: "DPIA Generator | Corelyx | Corelyx"
- **Root Cause:** The template probably appends `| Corelyx` twice (once in the page, once in the layout).

### 4.2 Pricing Button Missing Space
- **Severity:** Low
- **Location:** `/pricing`
- **Details:** The pricing toggle button text is "Yearly2 months free" instead of "Yearly - 2 months free" or "Yearly (2 months free)".
- **Test Evidence:** Button text from DOM: `['Monthly', 'Yearly2 months free', '']`

### 4.3 404 Pages Not Implemented Properly
- **Severity:** Medium
- **Location:** `/u/testuser`, `/tools/non-existent-tool`, `/this-page-does-not-exist-12345`
- **Details:** Non-existent pages either redirect to `/login` or return empty pages with no H1 heading and no proper 404 message.
- **Test Evidence:**
  - `/u/testuser` -> `h1: "no h1"`, body is mostly empty, 404 status in console
  - `/tools/non-existent-tool` -> `h1: "no h1"`, body mostly empty
  - `/this-page-does-not-exist-12345` -> Redirects to `/login` with `h1: "Welcome back"`
  - `/academy/non-existent` -> Redirects to `/docs/non-existent` (wrong fallback)
- **Risk:** Users cannot distinguish between a missing page and a login requirement. Search engines may receive incorrect signals.

### 4.4 German 404 Message on English Site
- **Severity:** Low
- **Location:** `/u/<script>alert(1)</script>`
- **Details:** When accessing a non-existent user profile with XSS in URL, the 404 message displays "Seite nicht gefunden" (German) instead of English.
- **Test Evidence:** `h1: "Seite nicht gefunden"`
- **Risk:** Localization inconsistency - the site is primarily English but some error messages are in German.

### 4.5 Fixed Bottom Banner Intercepts Clicks
- **Severity:** Low
- **Location:** All pages with cookie/consent banner
- **Details:** A fixed bottom banner (`z-50`) intercepts pointer events, preventing Playwright (and potentially real users) from clicking elements near the bottom of the page.
- **Test Evidence:**
  ```
  <div class="notranslate fixed bottom-4 right-4 z-[60] max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
  ```
  This subtree intercepts pointer events when trying to click footer links or bottom-positioned elements.

---

## 5. Navigation and Routing Issues

### 5.1 Public Pages Incorrectly Redirect to Login
- **Severity:** Medium
- **Location:** `/support`, `/support/data-requests`, `/updates`, `/guides`, `/consent`, `/governance`, `/account/compliance`
- **Details:** These pages appear to be public-facing content pages but redirect unauthenticated users to `/login`.
- **Test Evidence:**
  - `/support` -> `/login` (h1: "Welcome back")
  - `/support/data-requests` -> `/login`
  - `/updates` -> `/login`
  - `/guides` -> `/login`
  - `/consent` -> `/login`
  - `/governance` -> `/login`
  - `/account/compliance` -> `/login`
- **Risk:** Public users cannot access support, updates, or compliance information without logging in.

### 5.2 Academy Redirects to Docs on Missing Slug
- **Severity:** Low
- **Location:** `/academy/non-existent`
- **Details:** The academy route falls back to `/docs` when a slug is not found, instead of showing a 404.
- **Test Evidence:** `/academy/non-existent` -> `/docs/non-existent`

### 5.3 Auth Callback Page Shows Error Without Params
- **Severity:** Low
- **Location:** `/auth/callback`
- **Details:** Accessing `/auth/callback` without query parameters shows `error=auth_callback_failed` in the URL. This is correct behavior but could be handled more gracefully.
- **Test Evidence:** `/auth/callback` -> `/login?error=auth_callback_failed`

---

## 6. API Endpoint Issues

### 6.1 Internal Endpoints Have Inconsistent Method Handling
- **Severity:** Low
- **Location:** `/api/internal/agent-tools`
- **Details:** GET returns `405 Method Not Allowed`, POST returns `401 Unauthorized`. This inconsistency is confusing.
- **Test Evidence:**
  - GET `/api/internal/agent-tools` -> `405`
  - POST `/api/internal/agent-tools` -> `401`

### 6.2 Public API Returns 200 for Stripe Webhook with Empty Body
- **Severity:** Low
- **Location:** `/api/webhooks/stripe`
- **Details:** An empty POST body returns `{"received":true,"deprecated":true}` with HTTP 200 instead of a signature validation error.
- **Test Evidence:** `POST /api/webhooks/stripe` with `{}` -> `200 {"received":true,"deprecated":true}`
- **Risk:** The endpoint may accept unauthenticated requests and mark them as "received".

### 6.3 Billing Webhook Returns Different Error Format
- **Severity:** Low
- **Location:** `/api/billing/webhook`
- **Details:** Missing stripe-signature returns `{"error":"Missing stripe-signature header."}` with HTTP 400, which is correct but inconsistent with other webhook endpoints that return 500.

### 6.4 Triggers Webhook Returns 404 Instead of 401
- **Severity:** Low
- **Location:** `/api/triggers/webhook/test-token`
- **Details:** Invalid token returns `404 Not Found` instead of `401 Unauthorized`.
- **Test Evidence:** `POST /api/triggers/webhook/test-token` -> `404 {"error":"Not found"}`

### 6.5 Admin API Endpoints Redirect to Login Instead of 401
- **Severity:** Low
- **Location:** All `/api/admin/*` endpoints
- **Details:** Unauthenticated requests return `307 Redirect` to `/login` instead of `401 Unauthorized` or `403 Forbidden`.
- **Test Evidence:** All `/api/admin/*` endpoints return `307 /login`
- **Risk:** This is a Next.js middleware behavior, but it makes API testing harder and can confuse API consumers.

---

## 7. Genesis AI / Editor Testing

### 7.1 Genesis AI Requires Authentication
- **Severity:** Expected
- **Location:** `/api/genesis`, `/api/genesis/models`, `/api/genesis/stream`
- **Details:** All Genesis endpoints redirect to `/login` (307) when unauthenticated. This is correct security behavior.
- **Test Evidence:** All Genesis endpoints return `307 /login`

### 7.2 Editor and Program Pages Redirect to Login
- **Severity:** Expected
- **Location:** `/programs/new`, `/programs/new/building`, `/programs/[id]/editor`, `/programs/[id]/runs`, `/programs/[id]/settings`, `/programs/[id]/triggers`, `/programs/[id]/conflicts`
- **Details:** All authenticated routes correctly redirect to `/login` when the user is not logged in.
- **Test Evidence:** All program pages return `307 /login` or show login page with `h1: "Welcome back"`

### 7.3 Edit with AI Not Testable Without Authentication
- **Severity:** N/A
- **Location:** `/programs/[id]/editor`
- **Details:** The "Edit with AI" feature is embedded in the workflow editor which requires authentication. Without valid credentials, the feature could not be directly tested.
- **Note:** The Genesis prompt file (`apps/web/lib/genesis/prompt.ts`) shows a sophisticated system prompt with security rules, but the runtime implementation of the edit-with-AI endpoint could not be evaluated without auth.

---

## 8. Performance and Limits Testing

### 8.1 No Input Size Limits on Tools
- **Severity:** Medium
- **Location:** `/tools/dpia-generator`, `/tools/ai-inventory-generator`, `/tools/ai-act-risk-classifier`
- **Details:** Textareas and inputs accept 50,000+ characters without client-side truncation or warnings.
- **Test Evidence:**
  - DPIA textarea accepted 50,000 characters without truncation
  - No visual feedback or character counter present
- **Risk:** Users could submit extremely large payloads causing server-side processing issues or high API costs.

### 8.2 Very Long URLs Redirect to Login
- **Severity:** Low
- **Location:** All routes
- **Details:** URLs with 500+ characters redirect to `/login` instead of returning a 414 URI Too Long or proper 404.
- **Test Evidence:** `/` + `a`.repeat(500) -> `/login`

### 8.3 Special Characters in URL Are Encoded but Not Validated
- **Severity:** Low
- **Location:** All dynamic routes
- **Details:** XSS strings in URLs are properly URL-encoded by the browser but the server doesn't validate path parameters before processing.
- **Test Evidence:** `/u/<script>alert(1)</script>` -> URL encoded to `/u/%3Cscript%3Ealert(1)%3C/script%3E`, then shows "Seite nicht gefunden"

---

## 9. Console and Runtime Errors

### 9.1 Repeated Vercel Analytics CSP Errors
- **Count:** 40+ occurrences
- **Message:** `Loading the script 'https://va.vercel-scripts.com/v1/script.debug.js' violates the following Content Security Policy directive`
- **Impact:** Analytics completely broken, console noise for developers

### 9.2 React Hydration Errors on Tool Pages
- **Count:** 3+ occurrences
- **Message:** `Hydration failed because the server rendered text didn't match the client`
- **Impact:** SSR wasted, client-side re-render causes performance penalty and potential UI flicker

### 9.3 404 Resource Errors for Non-existent Profiles
- **Count:** 3+ occurrences
- **Message:** `Failed to load resource: the server responded with a status of 404 (Not Found)`
- **Impact:** Normal behavior for missing profiles, but no custom 404 page is shown

---

## 10. Issues Summary Table

| # | Category | Issue | Severity | Location |
|---|----------|-------|----------|----------|
| 1 | Security | XSS/SQL input not sanitized in forms | High | Login, Signup, Tools |
| 2 | Performance | React hydration mismatch on tool pages | High | `/tools/*` |
| 3 | Security | Vercel Analytics blocked by CSP | Medium | All pages |
| 4 | Security | Password reset leaks info | Medium | `/api/auth/reset-password` |
| 5 | UX | No input length limits | Medium | Login, Signup, Tools |
| 6 | UX | Webhooks return 500 for invalid payloads | Medium | `/api/webhooks/*` |
| 7 | UX | Inngest endpoint returns 500 | Medium | `/api/inngest` |
| 8 | UX | 404 pages not implemented | Medium | Multiple routes |
| 9 | UX | Public pages redirect to login | Medium | `/support`, `/updates`, etc. |
| 10 | UX | Duplicate title suffix | Low | `/tools/*` |
| 11 | UX | Pricing button missing space | Low | `/pricing` |
| 12 | UX | German 404 on English site | Low | `/u/*` |
| 13 | UX | Fixed banner intercepts clicks | Low | All pages |
| 14 | UX | No client-side email validation | Low | `/login` |
| 15 | API | Admin endpoints redirect instead of 401 | Low | `/api/admin/*` |
| 16 | API | Stripe webhook accepts empty body | Low | `/api/webhooks/stripe` |
| 17 | API | Triggers webhook returns 404 not 401 | Low | `/api/triggers/webhook/*` |

---

## 11. Recommendations (Not Implemented)

The following are documented for reference only, per instructions:

1. **Fix XSS/SQL injection input validation** - Add client-side and server-side input sanitization and length limits.
2. **Fix React hydration mismatch** - Replace `Date.now()` in tool page rendering with stable timestamps or suppress hydration warnings.
3. **Fix CSP for Vercel Analytics** - Add `https://va.vercel-scripts.com` to `script-src` or remove the analytics component.
4. **Fix password reset endpoint** - Return generic responses regardless of email existence to prevent enumeration.
5. **Implement proper 404 pages** - Add a `not-found.tsx` or `error.tsx` for unmatched routes.
6. **Fix webhook error handling** - Return 400/401 instead of 500 for invalid webhook payloads.
7. **Fix Inngest endpoint** - Return 200 or proper Inngest handshake response instead of 500.
8. **Fix page titles** - Remove duplicate `| Corelyx` suffix in tool pages.
9. **Fix navigation issues** - Make support, updates, guides public if they are intended to be.
10. **Add input limits** - Add `maxlength` attributes and character counters to tool forms.

---

## 12. Test Methodology

- **Browser:** Playwright Chromium (via MCP)
- **HTTP Client:** Node.js `http` module for API testing
- **Test Coverage:**
  - 50+ frontend routes
  - 80+ API endpoints
  - XSS, SQL injection, and long-input payloads
  - Navigation between legal/compliance pages
  - Form validation and edge cases
  - Console error monitoring
- **Environment:** Local Next.js dev server (`pnpm --filter @flowos/web dev`)

---

*End of Report*
