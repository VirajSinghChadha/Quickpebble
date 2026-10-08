import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The matching rules live in the page script itself; load that exact block so the test can't drift from it.
const src = readFileSync(new URL("../../src-tauri/src/inject.js", import.meta.url), "utf8");
const block = src.slice(src.indexOf("// <cookie-matchers>"), src.indexOf("// </cookie-matchers>"));
const { isRejectLabel, isConsentAttr } = new Function(`${block}; return { isRejectLabel, isConsentAttr };`)() as {
  isRejectLabel: (t: string) => boolean;
  isConsentAttr: (v: string) => boolean;
};

describe("cookie banner matching", () => {
  it("recognises refusals in the usual wordings", () => {
    for (const t of ["Reject all", "Reject All Cookies", "Decline", "  Deny  ", "Only necessary cookies", "Necessary cookies only", "Use necessary cookies only", "Continue without accepting", "No, thanks", "Refuse all", "Disagree", "Accept only essential cookies", "Reject non-essential", "I do not accept"]) {
      expect(isRejectLabel(t), t).toBe(true);
    }
  });

  it("never matches an accept button or unrelated text", () => {
    for (const t of ["Accept all", "Accept all cookies", "Allow all", "I agree", "OK", "Got it", "Accept cookies", "Agree to all", "Manage preferences", "Cookie settings", "Decline friend request and block this person immediately now", "", "Submit"]) {
      expect(isRejectLabel(t), t).toBe(false);
    }
  });

  it("only treats consent-looking containers as banners", () => {
    for (const v of ["onetrust-banner-sdk", "CybotCookiebotDialog", "cookie-consent", "didomi-host", "gdpr-modal", "qc-cmp2-container"]) expect(isConsentAttr(v), v).toBe(true);
    for (const v of ["header", "friend-request", "login-form", "", "main-content"]) expect(isConsentAttr(v), v).toBe(false);
  });
});
