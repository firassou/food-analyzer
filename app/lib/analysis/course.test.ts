import { describe, expect, it } from "vitest";
import { coursesOf, courseOf, MAX_COURSE_DAYS, parseCourseDays } from "./course";
import { normalize } from "./normalize";

describe("parseCourseDays", () => {
  it("reads a count of days, weeks or months in the languages of the boxes", () => {
    expect(parseCourseDays("7 jours")).toBe(7);
    expect(parseCourseDays("pendant 10 jours")).toBe(10);
    expect(parseCourseDays("7j")).toBe(7);
    expect(parseCourseDays("5 days")).toBe(5);
    expect(parseCourseDays("2 semaines")).toBe(14);
    expect(parseCourseDays("1 week")).toBe(7);
    expect(parseCourseDays("1 mois")).toBe(30);
    expect(parseCourseDays("7 أيام")).toBe(7);
    expect(parseCourseDays("٧ أيام")).toBe(7);
    expect(parseCourseDays("2 أسابيع")).toBe(14);
  });

  it("does not guess from a bare number or an unreadable note", () => {
    for (const text of [null, undefined, "", "x7", "7", "matin et soir", "1 boîte", "0 jours", "9999 jours", `${MAX_COURSE_DAYS + 1} days`])
      expect(parseCourseDays(text), String(text)).toBeNull();
  });
});

describe("courseOf", () => {
  const scan = (duration: string | null, at: Date, marks: object = {}) => ({
    id: "a",
    at: at.getTime(),
    result: normalize({
      kind: "medicine",
      label_detected: true,
      image_quality: "good",
      product: { name: "Amoxil" },
      medicine: { active: [{ name: "amoxicillin" }], marks: { morning: 1, midday: 0, evening: 1, confidence: "high", duration, ...marks } },
    }),
  });
  const day = (offset: number) => new Date(2026, 9, 7 + offset, 15, 30);

  it("counts the day it was scanned as the first day", () => {
    const c = courseOf(scan("7 jours", day(0)), day(0))!;
    expect(c).toMatchObject({ days: 7, perDay: 2, status: "ongoing", left: 6 });
    expect(c.last).toEqual(new Date(2026, 9, 13));
  });

  it("is on its last day, then finished", () => {
    expect(courseOf(scan("7 jours", day(-6)), day(0))).toMatchObject({ status: "last_day", left: 0 });
    expect(courseOf(scan("7 jours", day(-7)), day(0))).toMatchObject({ status: "finished", left: -1 });
  });

  it("has nothing to say without a readable duration or marks", () => {
    expect(courseOf(scan(null, day(0)), day(0))).toBeNull();
    expect(courseOf(scan("matin", day(0)), day(0))).toBeNull();
    expect(courseOf({ id: "b", at: 0, result: normalize({ kind: "medicine", medicine: { active: [{ name: "x" }] } }) }, day(0))).toBeNull();
  });

  it("lists the courses still running first, the soonest to end leading", () => {
    const list = coursesOf([scan("10 jours", day(0)), scan("3 jours", day(0)), scan("2 jours", day(-5)), scan("5 jours", day(-1))], day(0));
    expect(list.map((c) => [c.days, c.status])).toEqual([[3, "ongoing"], [5, "ongoing"], [10, "ongoing"], [2, "finished"]]);
  });
});
