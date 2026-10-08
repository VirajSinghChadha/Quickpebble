import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipc, type PageSnapshot } from '../lib/ipc';
import { makeTab, useStore } from './useStore';
import { useChat } from './useChat';

beforeEach(() => {
  vi.restoreAllMocks();
  const tab = makeTab({ id: 'source-tab', url: 'https://example.com' });
  useStore.setState({ tabs: [tab], activeId: tab.id });
  useChat.setState({ items: [], busy: false, mode: 'ask', sourceTabIds: [], webResearch: false, includeCurrentPage: true, approval: null });
});
const snapshot = { url: 'https://example.com', title: 'Page title', text: 'Actual evidence' } as PageSnapshot;
const reply = '{"paragraphs":[{"text":"Evidence-based answer","citations":[1]}]}';
describe('assistant source and cancellation lifecycle', () => {
  it('attaches the current page and keeps paragraph citations', async () => {
    vi.spyOn(ipc,'agentExec').mockResolvedValue(snapshot);
    vi.spyOn(ipc,'aiChat').mockResolvedValue(reply);
    const search = vi.spyOn(ipc,'researchSearch');
    await useChat.getState().send('Explain this');
    const answer = useChat.getState().items.find(i => i.kind === 'assistant');
    expect(answer?.sources?.[0].url).toBe(new URL(snapshot.url).href);
    expect(answer?.blocks?.[0].citations).toEqual([1]);
    expect(search).not.toHaveBeenCalled();
  });
  it('does not publish late model replies after Stop', async () => {
    vi.spyOn(ipc,'agentExec').mockResolvedValue(snapshot);
    let resolve!: (s: string) => void;
    vi.spyOn(ipc,'aiChat').mockImplementation(() => new Promise(r => { resolve = r; }));
    const running = useChat.getState().send('Explain');
    await vi.waitFor(() => expect(ipc.aiChat).toHaveBeenCalled());
    useChat.getState().stop(); resolve(reply); await running;
    expect(useChat.getState().items.some(i => i.kind === 'assistant')).toBe(false);
    expect(useChat.getState().busy).toBe(false);
  });
  it('makes failed page reads explicit instead of claiming sourced answers', async () => {
    vi.spyOn(ipc,'agentExec').mockRejectedValue(new Error('Page unavailable'));
    const chat = vi.spyOn(ipc,'aiChat');
    await useChat.getState().send('Explain');
    expect(chat).not.toHaveBeenCalled();
    expect(useChat.getState().items.at(-1)?.text).toContain("Couldn't read");
  });
  it('includes opt-in search sources and ignores model-invented references', async () => {
    useChat.setState({ webResearch: true });
    vi.spyOn(ipc,'agentExec').mockResolvedValue(snapshot);
    vi.spyOn(ipc,'researchSearch').mockResolvedValue([{title:'Research',url:'https://research.example',text:'Search excerpt'}]);
    vi.spyOn(ipc,'aiChat').mockResolvedValue('{"paragraphs":[{"text":"From the search excerpt","citations":[2,99]}]}');
    await useChat.getState().send('A question');
    expect(useChat.getState().items.at(-1)?.sources).toMatchObject([{id:2,kind:'search',url:'https://research.example/'}]);
  });
});
