import { describe, expect, it } from "vitest";
import { Db } from "./db.mjs";
import { cleanReminders, notesHtml, School, validIcs } from "./school.mjs";

const fakeBrowser = () => { const sent = []; return { sent, windows: new Map([["main", { private: false, win: { show() {} } }]]), emitUi: (_w, ch, p) => sent.push([ch, p]) }; };

describe("school, main-process side", () => {
  it("only accepts sensible reminder times", () => {
    const at = 1_000_000_000_000;
    expect(cleanReminders([at - 1, at + 60_000, at + 60_000, at + 30 * 3600_000, "x", at + 7200_000], at)).toEqual([at + 60_000, at + 7200_000]);
  });
  it("only writes real calendar files", () => {
    expect(validIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(validIcs("<html>")).toBe(false);
    expect(validIcs("BEGIN:VCALENDAR\nBEGIN:VALARM\nACTION:EMAIL\nEND:VALARM\nEND:VCALENDAR")).toBe(false);
  });
  it("escapes note text for Apple Notes", () => {
    expect(notesHtml("Due <soon>", "a & b\n\nc")).toBe("<h1>Due &lt;soon&gt;</h1><div>a &amp; b</div><div><br></div><div>c</div>");
  });
  it("saves packs, fires due reminders once, and deletes", () => {
    const b = fakeBrowser();
    const s = new School(new Db(":memory:"), b);
    s.stop();
    const soon = Date.now() + 60_000;
    const id = s.save({ title: "Volcanoes", summary: "x", flashcards: [], quiz: [] }, [soon]);
    expect(s.list()[0]).toMatchObject({ id, title: "Volcanoes", next: soon });
    expect(s.remind(soon - 1)).toBe(0);
    expect(s.remind(soon + 1)).toBe(1);
    expect(s.remind(soon + 2)).toBe(0);
    expect(b.sent).toEqual([["qp://study-reminder", { id, title: "Volcanoes" }]]);
    expect(s.get(id).pack.title).toBe("Volcanoes");
    s.remove(id);
    expect(s.list()).toEqual([]);
    expect(() => s.save({}, [])).toThrow(/empty/);
  });
});
