import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ WebContentsView: class {} }));
const { cardHtml, cardPlace, CARD_W } = await import("./hovercard.mjs");

describe("tab hover card", () => {
  it("escapes the page title and only accepts our own image", () => {
    const h = cardHtml({ title: '<img src=x onerror=alert(1)>', host: "a&b.com", thumb: "https://evil.example/x.png", dark: false });
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;img src=x");
    expect(h).not.toContain("evil.example");
    expect(h).toContain("No preview yet");
    expect(cardHtml({ title: "t", host: "h", thumb: "data:image/jpeg;base64,AAAA", dark: true })).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(cardHtml({ title: "t", host: "h", thumb: 'data:image/jpeg;base64,AA"onerror="x', dark: true })).not.toContain("onerror");
  });
  it("keeps the card inside the window", () => {
    const b = { width: 1000, height: 700 };
    expect(cardPlace({ x: 0, y: 8, width: 100, height: 30 }, b).x).toBe(8);
    expect(cardPlace({ x: 950, y: 8, width: 100, height: 30 }, b).x).toBe(1000 - CARD_W - 8);
    expect(cardPlace({ x: 400, y: 8, width: 100, height: 30 }, b).y).toBe(44);
  });
});
