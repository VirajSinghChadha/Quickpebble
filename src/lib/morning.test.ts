import { describe, expect, it } from "vitest";
import { countryName, greeting, parseCountries } from "./morning";

describe("morning settings", () => {
  it("keeps up to three known countries", () => {
    expect(parseCountries('["AE","XX","GB","AE","US","NZ"]')).toEqual(["AE", "GB", "US"]);
    expect(parseCountries(undefined)).toEqual([]);
    expect(countryName("NZ")).toBe("New Zealand");
  });
  it("greets by the hour", () => {
    expect([greeting(7), greeting(14), greeting(21)]).toEqual(["Good morning", "Good afternoon", "Good evening"]);
  });
});
