import { describe, expect, it } from "vitest";
import { describeStep, findElement, matchTrigger, needsConfirm, scheduleText, type Routine } from "./routines";

const snap = { elements: [
  { i: 0, tag: "a", label: "Timetable" },
  { i: 1, tag: "input", type: "text", label: "Email address" },
  { i: 2, tag: "input", type: "password", label: "Password" },
  { i: 3, tag: "button", label: "Submit assignment" },
  { i: 4, tag: "select", label: "Week" },
  { i: 5, tag: "button", label: "Download", disabled: true },
] };

describe("routine steps", () => {
  it("read plainly and never show a secret", () => {
    expect(describeStep({ type: "open_url", url: "https://www.school.example/x" })).toBe("Open school.example");
    expect(describeStep({ type: "type", label: "Password", text: "", secret: true })).toBe("You type your Password yourself");
    expect(describeStep({ type: "open_panel", panel: "cleanup" })).toBe("Open Clean-up");
  });
  it("ask again before anything that sends, submits, buys or deletes", () => {
    expect(needsConfirm({ type: "click", label: "Submit assignment" })).toBe(true);
    expect(needsConfirm({ type: "click", label: "Place order" })).toBe(true);
    expect(needsConfirm({ type: "do", text: "send the email to my teacher" })).toBe(true);
    expect(needsConfirm({ type: "click", label: "Timetable" })).toBe(false);
  });
  it("find the right element on today's page, never a password field or a disabled button", () => {
    expect(findElement(snap, "timetable", "click")).toBe(0);
    expect(findElement(snap, "Email", "field")).toBe(1);
    expect(findElement(snap, "Password", "field")).toBeNull();
    expect(findElement(snap, "Week", "select")).toBe(4);
    expect(findElement(snap, "Download", "click")).toBeNull();
    expect(findElement(snap, "Grades", "click")).toBeNull();
  });
});

describe("shortcut phrases", () => {
  const routines = [{ id: 1, name: "Tidy", steps: [], trigger: "tidy up", schedule: null }] as Routine[];
  it("match the whole message, politely or not", () => {
    expect(matchTrigger("Tidy up!", routines)?.id).toBe(1);
    expect(matchTrigger("please tidy up", routines)?.id).toBe(1);
    expect(matchTrigger("can you tidy up my desk and then email Sam", routines)).toBeNull();
  });
  it("describe schedules in words", () => {
    expect(scheduleText({ days: [5], time: "16:00" })).toBe("Fridays at 16:00");
    expect(scheduleText({ days: [1, 2, 3, 4, 5], time: "08:00" })).toBe("Weekdays at 08:00");
  });
});
