import type { ChatItem } from "../store/useChat";

/** The conversation as Markdown, with numbered sources under each answer. Step logs are left out. */
export function chatToMarkdown(items: ChatItem[], when = new Date()): string {
  const out: string[] = [`# Quick Pebble conversation\n\n_${when.toISOString().slice(0, 10)}_`];
  for (const i of items) {
    if (i.kind === "user") out.push(`**You:** ${i.text}`);
    else if (i.kind === "assistant" || i.kind === "question") {
      const lines = [`**Pebble:** ${i.text}`];
      if (i.sources?.length) lines.push("", "Sources:", ...i.sources.map((s) => `${s.id}. [${s.title.replace(/[\[\]]/g, "")}](${s.url})`));
      out.push(lines.join("\n"));
    }
  }
  return out.join("\n\n") + "\n";
}
