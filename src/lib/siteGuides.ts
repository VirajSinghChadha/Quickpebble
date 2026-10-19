// Special modes for sites the assistant has to understand to work on. Each guide is plain text added to the task, so the
// model knows how the site behaves. A guide switches on by itself when the active tab is on that site.
import { hostOfUrl } from "./siteAllow";

export interface SiteGuide {
  id: "education-perfect";
  name: string;
  /** The text added to the task. `notes` is whatever the person wrote under Settings for this site. */
  text: (notes: string) => string;
}

const EDUCATION_PERFECT: SiteGuide = {
  id: "education-perfect",
  name: "Education Perfect",
  text: (notes) => [
    "You are on Education Perfect, a school learning site. How it works:",
    "- Answers must be FULLY SIMPLIFIED before they count as finished: fractions in lowest terms, like terms collected, brackets expanded or factorised as the question asks, surds and powers tidied. An answer that is right but not simplified is not final.",
    "- After you submit an answer the site shows a tick. A GREEN tick means the answer is correct: move on to the next question. A BLUE tick means the answer is on the right track or correct but not fully simplified yet: it is NOT done. Simplify it further and submit again. No tick, or a cross, means it is wrong: re-read the question and try again.",
    "- Read the whole question and any worked example on the page before answering, and check the tick colour before doing anything else.",
    notes.trim() ? `- The person's own notes on how to write answers (their shortcuts and typing rules). Follow these exactly when typing an answer:\n${notes.trim().slice(0, 2000)}` : "- The person has not written down their shortcuts yet. Type answers in plain text the way the answer box shows them.",
  ].join("\n"),
};

const GUIDES: { hosts: string[]; guide: SiteGuide }[] = [{ hosts: ["educationperfect.com"], guide: EDUCATION_PERFECT }];

/** The guide for the site this page is on (the site or any subdomain), or null. */
export function guideFor(url: string): SiteGuide | null {
  const h = hostOfUrl(url);
  if (!h) return null;
  return GUIDES.find((g) => g.hosts.some((s) => h === s || h.endsWith(`.${s}`)))?.guide ?? null;
}
