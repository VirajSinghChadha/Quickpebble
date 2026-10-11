// The 60-second first-run tour: what the person needs to know before using the assistant. Text only; the screen draws it.

export const TOUR_VERSION = "v1";

export interface TourStep {
  icon: "sparkles" | "key" | "bot" | "shield" | "folder" | "lock" | "check";
  title: string;
  body: string;
  /** An optional button that takes the person to the thing the step talks about. */
  action?: { label: string; target: "settings" | "assistant" };
}

export const TOUR_STEPS: TourStep[] = [
  { icon: "sparkles", title: "Welcome to Quick Pebble", body: "A light, private browser with an AI assistant built in. This one-minute tour shows what the assistant can do and how you stay in control." },
  { icon: "key", title: "Your account and your key", body: "You're signed in, and you stay signed in after updates. Add your Gemini key in Settings, then AI. It's saved encrypted to your account, so it's there whenever you sign back in.", action: { label: "Open Settings", target: "settings" } },
  { icon: "bot", title: "Three ways to use the assistant", body: "Ask answers questions about a page, with sources. Do tasks works in your browser tabs. Screen operates your whole computer. Press Cmd/Ctrl+Shift+Space from any app to open it.", action: { label: "Open the assistant", target: "assistant" } },
  { icon: "shield", title: "You stay in control", body: "It asks before anything risky, with numbered choices, and shows its plan first for big tasks. Pause (Cmd/Ctrl+Alt+P) to do a step yourself, or Stop at any time. A bar at the bottom of your screen shows what it sees and does next." },
  { icon: "folder", title: "It remembers your projects", body: "Pick a project in the assistant and it keeps your notes in mind in every mode. Your chats come back when you reopen the app, and old ones can be squashed into short summaries in Settings." },
  { icon: "lock", title: "Your privacy", body: "Ads and trackers are blocked. Screen mode sends a screenshot to Google Gemini at each step, only while it works, and Settings shows how many AI calls you've used today." },
  { icon: "check", title: "You're all set", body: "Try it now: open the assistant and ask it something. You can replay this tour any time from Settings." },
];

export const TOUR_WORDS = TOUR_STEPS.reduce((n, s) => n + `${s.title} ${s.body}`.split(/\s+/).length, 0);

/** Show the tour to people who haven't seen this version of it. */
export const shouldShowTour = (seen: string | undefined): boolean => seen !== TOUR_VERSION;
