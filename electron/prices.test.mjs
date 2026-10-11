import { describe, expect, it } from "vitest";
import { loadRetailers, matchOffer, parseOffers, parseOverrides, priceSeen, rankResults, searchUrl, shopsFor, validShop } from "./prices.mjs";

describe("retailers", () => {
  const data = loadRetailers();
  it("has the major shops for the UAE and every country is well formed", () => {
    const ae = data.AE.shops.map((s) => s.name);
    for (const n of ["Sharaf DG", "Amazon.ae", "Noon", "Jumbo", "Carrefour UAE", "Lulu Hypermarket", "Virgin Megastore"]) expect(ae).toContain(n);
    expect(data.AE.currency).toBe("AED");
    for (const [code, c] of Object.entries(data)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
      for (const s of c.shops) expect(validShop(s), `${code} ${s.name}`).toBeNull();
    }
  });
  it("lets people add and remove shops per country", () => {
    const o = parseOverrides(JSON.stringify({ AE: { added: [{ name: "My Shop", search: "https://myshop.example/s?q={q}" }, { name: "Bad", search: "http://evil.example/{q}" }], removed: ["Noon"] }, xx: {} }));
    expect(o.AE.added).toHaveLength(1);
    const shops = shopsFor("AE", data, o).map((s) => s.name);
    expect(shops).toContain("My Shop");
    expect(shops).not.toContain("Noon");
    expect(shopsFor("GB", data, o).map((s) => s.name)).toContain("Argos");
  });
  it("only accepts safe shop addresses", () => {
    expect(validShop({ name: "X", search: "https://x.example/search?q={q}" })).toBeNull();
    expect(validShop({ name: "X", search: "http://x.example/search?q={q}" })).toMatch(/https/);
    expect(validShop({ name: "X", search: "javascript:alert(1)//{q}" })).toMatch(/https|web address/);
    expect(validShop({ name: "X", search: "https://x.example/search" })).toMatch(/\{q\}/);
    expect(validShop({ name: "<b>", search: "https://x.example/{q}" })).toMatch(/plain name/);
  });
  it("builds search addresses with the words safely encoded", () => {
    expect(searchUrl("https://www.amazon.ae/s?k={q}", " PS5 Slim & disc ")).toBe("https://www.amazon.ae/s?k=PS5%20Slim%20%26%20disc");
  });
});

describe("reading offers honestly", () => {
  it("keeps well-formed offers only", () => {
    const o = parseOffers(JSON.stringify({ offers: [{ title: "PS5 Slim Disc", price: "1,899", currency: "aed", inStock: true, condition: "new", url: "javascript:x" }, { title: "", price: 5 }, { title: "Weird", price: -3 }] }));
    expect(o).toHaveLength(2);
    expect(o[0]).toMatchObject({ price: 1899, currency: "AED", url: "", inStock: true });
    expect(o[1].price).toBeNull();
  });
  it("shows a price only if it's really on the page", () => {
    expect(priceSeen(1899, "PlayStation 5 Slim AED 1,899.00 Free delivery")).toBe(true);
    expect(priceSeen(1899, "PlayStation 5 Slim AED 1.899,00")).toBe(true);
    expect(priceSeen(1899.5, "Now 1,899.50 AED")).toBe(true);
    expect(priceSeen(1899, "Was 21,899 now 2,099")).toBe(false);
    expect(priceSeen(1899, "Model 18990 costs 2,099")).toBe(false);
    expect(priceSeen(null, "1899")).toBe(false);
  });
  it("compares like with like and says when unsure", () => {
    expect(matchOffer("PS5 Slim disc", { title: "Sony PlayStation 5 PS5 Slim Console Disc Edition", condition: "new" }).match).toBe("same");
    expect(matchOffer("PS5 Slim disc", { title: "PS5 Slim Digital Edition", condition: "new" })).toMatchObject({ match: "unsure" });
    expect(matchOffer("PS5 Slim disc", { title: "PS5 Slim Disc Console (Renewed)", condition: "" }).match).toBe("different");
    expect(matchOffer("PS5 Slim", { title: "Silicone cover for PS5 Slim controller", condition: "new" }).match).toBe("different");
    expect(matchOffer("iPhone 16 Pro 256GB", { title: "Apple iPhone 16 256GB", condition: "new" }).match).toBe("unsure");
  });
  it("puts the cheapest real match first and marks it, keeping shops that couldn't be read", () => {
    const rows = rankResults([
      { shop: "A", status: "ok", url: "u", checkedAt: 1, offers: [{ title: "x", price: 2000, match: "same" }] },
      { shop: "B", status: "ok", url: "u", checkedAt: 1, offers: [{ title: "x used", price: 1500, match: "different" }] },
      { shop: "C", status: "blocked", url: "u", checkedAt: 1, offers: [], note: "robot check" },
      { shop: "D", status: "ok", url: "u", checkedAt: 1, offers: [{ title: "x", price: 1900, match: "same" }] },
    ]);
    expect(rows.map((r) => r.shop)).toEqual(["D", "A", "B", "C"]);
    expect(rows[0].cheapest).toBe(true);
    expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  });
});
