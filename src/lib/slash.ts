/** Slash commands for the assistant's Ask mode: short, memorable shortcuts for common research jobs. */
export interface SlashCommand {
  name: string;
  hint: string;
  /** Question sent to the model. */
  prompt: string;
  /** Read every loaded tab (up to four) instead of just the current page. */
  allTabs?: boolean;
  /** Also search the person's browsing memory (Recall). */
  recall?: boolean;
}

const COMMANDS: Record<string, (arg: string) => SlashCommand> = {
  summarize: (a) => ({ name: "summarize", hint: "Summarize this page", prompt: a ? `Summarize this page, focusing on: ${a}` : "Summarize this page in a short paragraph, then list the key points." }),
  tldr: () => ({ name: "tldr", hint: "Two-sentence summary", prompt: "Give me a two-sentence TL;DR of this page." }),
  explain: (a) => ({ name: "explain", hint: "Explain simply", prompt: a ? `Explain this in simple terms: ${a}` : "Explain what this page is saying in simple terms, as if I'm new to the topic." }),
  critique: () => ({ name: "critique", hint: "Check claims and bias", prompt: "Critically evaluate this page: what claims does it make, how well supported are they by what the page itself shows, and what might be missing or one-sided?" }),
  compare: (a) => ({ name: "compare", hint: "Compare open tabs", allTabs: true, prompt: a ? `Compare my open pages with respect to: ${a}. Show the main differences and similarities and say which fits best.` : "Compare my open pages: the main differences and similarities, and which one is the best fit and why." }),
  tabs: () => ({ name: "tabs", hint: "Digest all open tabs", allTabs: true, prompt: "Give me a digest of my open pages: one short paragraph on each, then how they relate to each other." }),
  recall: (a) => ({ name: "recall", hint: "Search what you've read", recall: true, prompt: a || "What have I been reading recently?" }),
};

export const SLASH_HELP: { name: string; hint: string }[] = Object.keys(COMMANDS).map((n) => ({ name: n, hint: COMMANDS[n]("").hint }));

/** Parses "/compare price" → a command; anything else (including unknown commands) → null so it is sent as typed. */
export function parseSlash(input: string): SlashCommand | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(input.trim());
  if (!m) return null;
  const make = COMMANDS[m[1].toLowerCase()];
  return make ? make((m[2] ?? "").trim().slice(0, 500)) : null;
}

/** Commands whose name starts with what has been typed after "/", for the composer's suggestions. */
export function slashMatches(input: string): { name: string; hint: string }[] {
  const m = /^\/([a-z]*)$/i.exec(input);
  return m ? SLASH_HELP.filter((c) => c.name.startsWith(m[1].toLowerCase())) : [];
}
