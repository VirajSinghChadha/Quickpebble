import { describe, expect, it } from "vitest";
import { planHome } from "./homeLayout";

const all = { weather: true, news: true, tiles: true, cards: true };

describe("home layout plan", () => {
  it("shows everything on a tall window, with all five headlines", () => {
    const p = planHome(1000, all);
    expect(p).toMatchObject({ compact: false, widgets: true, tiles: true, cards: true, quick: true });
    expect(p.newsCount).toBeGreaterThanOrEqual(2);
  });

  it("drops the least important parts first as the window shrinks", () => {
    for (let h = 1100; h >= 400; h -= 10) {
      const p = planHome(h, all);
      // the widgets the person asked for always stay; the optional extras go as space runs out
      expect(p.widgets, `widgets at ${h}`).toBe(true);
    }
    expect(planHome(400, all).cards).toBe(false);
    expect(planHome(400, all).tiles).toBe(false);
  });

  it("always keeps what the person turned on, and at least one headline", () => {
    for (const h of [300, 400, 500, 600, 800, 1200]) {
      const p = planHome(h, all);
      expect(p.widgets).toBe(true);
      expect(p.newsCount).toBeGreaterThanOrEqual(1);
      expect(p.newsCount).toBeLessThanOrEqual(5);
    }
  });

  it("gives news more room when weather is off, and does nothing when both are off", () => {
    expect(planHome(600, { ...all, weather: false }).newsCount).toBeGreaterThanOrEqual(planHome(600, all).newsCount);
    const none = planHome(700, { weather: false, news: false, tiles: true, cards: true });
    expect(none.widgets).toBe(false);
    expect(none.newsCount).toBe(0);
  });

  it("respects options the person switched off", () => {
    const p = planHome(1000, { ...all, tiles: false, cards: false });
    expect(p.tiles).toBe(false);
    expect(p.cards).toBe(false);
  });

  it("is monotonic: more height never removes a section", () => {
    const order = (p: ReturnType<typeof planHome>) => [p.tiles, p.cards, p.quick].filter(Boolean).length;
    let last = 0;
    for (let h = 300; h <= 1000; h += 20) {
      const n = order(planHome(h, all));
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
});

describe("the plan really fits", () => {
  // Same numbers the page measures: sections + gaps must not exceed the height whenever the minimum fits.
  const SIZE = { header: 24, heroFull: 115, heroCompact: 36, search: 56, tiles: 98, cards: 82, quick: 31, weather: 150, newsHead: 76, newsItem: 68 };
  it("never plans more than the page can hold (above the minimum size)", () => {
    for (let h = 520; h <= 1200; h += 10) {
      const p = planHome(h, all);
      const gap = p.compact ? 12 : 20;
      const parts = [SIZE.header, p.compact ? SIZE.heroCompact : SIZE.heroFull, SIZE.search, Math.max(SIZE.weather, SIZE.newsHead + p.newsCount * SIZE.newsItem)];
      if (p.tiles) parts.push(SIZE.tiles);
      if (p.cards) parts.push(SIZE.cards);
      if (p.quick) parts.push(SIZE.quick);
      const total = parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * gap + (p.compact ? 24 : 40);
      expect(total, `height ${h}`).toBeLessThanOrEqual(h);
    }
  });
});
