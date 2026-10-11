import { describe, expect, it } from "vitest";
import { findMessage, parseFind, parseSort } from "./tabAsk";

const tabs = [
  { id: "a", title: "Volcanoes explained", host: "nationalgeographic.com" },
  { id: "b", title: "Inbox", host: "mail.google.com" },
  { id: "c", title: "Lava flows", host: "usgs.gov" },
];
describe("asking about tabs", () => {
  it("numbers the tabs and sends only titles and sites", () => {
    const m = findMessage(tabs, "volcano page");
    expect(m).toContain("1. Volcanoes explained — nationalgeographic.com");
    expect(m).not.toContain("http");
  });
  it("maps numbers back to real tabs and ignores made-up ones", () => {
    expect(parseFind('Sure! {"tabs":[3,1,9,0,"x",1]}', tabs)).toEqual(["c", "a"]);
    expect(parseFind("no json", tabs)).toEqual([]);
    expect(parseFind('{"tabs":"1"}', tabs)).toEqual([]);
  });
  it("only accepts the allowed groups", () => {
    const r = parseSort('{"groups":{"School":[1,3],"Work":[2,1],"Hacking":[2]}}', tabs);
    expect([...r]).toEqual([["a", "School"], ["c", "School"], ["b", "Work"]]);
    expect(parseSort("{}", tabs).size).toBe(0);
  });
});
