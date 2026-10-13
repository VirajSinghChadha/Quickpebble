import { describe, expect, it } from "vitest";
import { assignmentsNote, buildIcs, checkSubmission, dueThisWeek, nameMatches, parseAssignments, parseQuestion, parseRules, parseStudyPack, parseTimetable, regexRules, reminderTimes, speakable } from "./study";

describe("study packs", () => {
  it("keeps only usable cards and questions", () => {
    const p = parseStudyPack(`Here you go: ${JSON.stringify({ title: "Volcanoes", summary: "Magma rises.", flashcards: [{ q: "What is lava?", a: "Magma above ground" }, { q: "", a: "x" }], quiz: [{ q: "Where is magma?", choices: ["Mantle", "Sky"], answer: 0, why: "It forms below" }, { q: "Bad", choices: ["a"], answer: 0 }, { q: "Out of range", choices: ["a", "b"], answer: 5 }] })}`);
    expect(p?.flashcards).toHaveLength(1);
    expect(p?.quiz).toHaveLength(1);
    expect(parseStudyPack("no")).toBeNull();
  });
  it("reminds later the same day, never at night", () => {
    const morning = new Date(2026, 9, 11, 9, 0).getTime();
    expect(reminderTimes(morning).map((t) => new Date(t).getHours())).toEqual([10, 12, 16]);
    const evening = new Date(2026, 9, 11, 19, 30).getTime();
    expect(reminderTimes(evening).map((t) => new Date(t).getHours())).toEqual([20]);
  });
});

describe("timetable", () => {
  it("reads classes and refuses nonsense", () => {
    const list = parseTimetable(JSON.stringify({ classes: [{ day: "monday", start: "8:00", end: "08:45", subject: "Maths", room: "B12" }, { day: "Funday", start: "09:00", end: "10:00", subject: "X" }, { day: "Tue", start: "10:00", end: "09:00", subject: "Backwards" }, { day: "Wed", start: "25:00", end: "26:00", subject: "Late" }] }));
    expect(list).toEqual([{ day: "Mon", start: "08:00", end: "08:45", subject: "Maths", room: "B12", teacher: "" }]);
  });
  it("makes a weekly repeating calendar file from this week's Monday, with text escaped", () => {
    const ics = buildIcs([{ day: "Wed", start: "08:00", end: "08:45", subject: "Maths; algebra, part 1", room: "B12", teacher: "Ms. K" }], new Date(2026, 9, 11), 12, new Date("2026-10-11T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261007T080000");          // Wednesday of the week containing Sunday 11 October
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=12");
    expect(ics).toContain("SUMMARY:Maths\\; algebra\\, part 1");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});

describe("assignments", () => {
  const today = new Date(2026, 9, 12);   // Monday
  const list = parseAssignments(JSON.stringify({ assignments: [
    { title: "Essay", course: "English", due: "2026-10-15", status: "assigned" },
    { title: "Lab report", course: "Science", due: "2026-10-09", status: "missing" },
    { title: "Done one", due: "2026-10-13", status: "done" },
    { title: "Next week", due: "2026-10-20", status: "assigned" },
    { title: "No date", due: "soon", status: "missing" },
    { title: "" },
  ] }));
  it("reads assignments and splits overdue, this week and undated", () => {
    expect(list).toHaveLength(5);
    const d = dueThisWeek(list, today);
    expect(d.overdue.map((a) => a.title)).toEqual(["Lab report"]);
    expect(d.week.map((a) => a.title)).toEqual(["Essay"]);
    expect(d.undated.map((a) => a.title)).toEqual(["No date"]);
    const note = assignmentsNote(d, today);
    expect(note).toMatch(/Overdue:\n- Lab report \(Science\)/);
    expect(note).toMatch(/This week:\n- Essay \(English\), due/);
    expect(note).not.toMatch(/Done one|Next week/);
  });
});

describe("submit-checker", () => {
  it("reads simple rules straight from the page text", () => {
    expect(regexRules("Accepted file types: .pdf, .docx. Maximum file size: 10 MB")).toEqual({ types: ["pdf", "docx"], maxBytes: 10 * 1024 * 1024 });
    expect(regexRules("Upload up to 500 KB")).toEqual({ maxBytes: 500 * 1024 });
  });
  it("trusts the AI only for well-formed rules, falling back to the text", () => {
    const r = parseRules(JSON.stringify({ types: [".PDF", "exe;rm -rf"], maxMB: "x", namePattern: "Lastname_Firstname_Essay", notes: ["One file only"] }), "Max size 5 MB");
    expect(r).toEqual({ types: ["pdf"], maxBytes: 5 * 1024 * 1024, nameRule: "", namePattern: "Lastname_Firstname_Essay", notes: ["One file only"] });
  });
  it("matches name patterns by parts, with placeholders", () => {
    expect(nameMatches("Smith_John_Essay", "Lastname_Firstname_Essay")).toBe(true);
    expect(nameMatches("Smith_John_Report", "Lastname_Firstname_Essay")).toBe(false);
    expect(nameMatches("essay", "Lastname_Firstname_Essay")).toBe(false);
  });
  it("says what's wrong in plain words", () => {
    const rules = { types: ["pdf"], maxBytes: 1024 * 1024, nameRule: "", namePattern: "Lastname_Firstname_Essay", notes: [] };
    expect(checkSubmission(rules, { name: "Smith_John_Essay.pdf", size: 1000 })).toEqual([]);
    const p = checkSubmission(rules, { name: "my essay.docx", size: 3 * 1024 * 1024 });
    expect(p).toHaveLength(3);
    expect(p[0]).toMatch(/\.docx file, but the assignment accepts \.pdf/);
    expect(p[1]).toMatch(/3\.0 MB, over the 1 MB limit/);
    expect(p[2]).toMatch(/Lastname_Firstname_Essay\.docx/);
    expect(checkSubmission({ types: [], maxBytes: null, nameRule: "", namePattern: null, notes: [] }, { name: "a.pdf", size: 0 })).toEqual(["The file is empty."]);
  });
});

describe("practice partner", () => {
  it("reads a question without the answer and makes it speakable", () => {
    const q = parseQuestion(JSON.stringify({ question: "What is 2 + 2?", choices: ["3", "4"] }));
    expect(speakable(q!)).toBe("What is 2 + 2? A: 3. B: 4.");
    expect(parseQuestion("{}")).toBeNull();
  });
});

describe("file type lists", () => {
  it("stops at the end of the list", async () => {
    const { regexRules } = await import("./study");
    expect(regexRules("Allowed formats: pdf, docx or txt. Due Friday.").types).toEqual(["pdf", "docx", "txt"]);
    expect(regexRules("File type: .PDF only").types).toEqual(["pdf"]);
  });
});
