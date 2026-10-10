import { useEffect, useState } from "react";
import { FolderKanban, History, MessageSquarePlus, Trash2 } from "lucide-react";
import { ipc } from "../lib/ipc";
import { formatBytes, lastUsedLabel } from "../lib/context";
import { useHidePage } from "../hooks/useHidePage";
import { useChat } from "../store/useChat";
import { Modal, ModalHeader } from "./Modal";

/** One slim row above the chat: which project the assistant knows about, new chat, and past chats. */
export function ContextBar() {
  const { projects, projectId, busy, setProject, newChat } = useChat();
  const [dialog, setDialog] = useState<null | "projects" | "history">(null);
  useEffect(() => { void useChat.getState().initContext(); }, []);
  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
      <FolderKanban size={14} className="shrink-0 text-text-secondary" aria-hidden />
      <select
        value={projectId ?? ""}
        disabled={busy}
        onChange={(e) => (e.target.value === "__manage" ? setDialog("projects") : void setProject(e.target.value ? Number(e.target.value) : null))}
        aria-label="Project the assistant should know about"
        title="The assistant reads this project's notes with every request"
        className="min-w-0 flex-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[12px]"
      >
        <option value="">No project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__manage">Add or edit projects…</option>
      </select>
      <button type="button" disabled={busy} onClick={newChat} title="Start a new chat (the old one stays in History)" aria-label="New chat" className="grid size-7 place-items-center rounded-full text-text-secondary hover:bg-surface-secondary disabled:opacity-40"><MessageSquarePlus size={15} /></button>
      <button type="button" onClick={() => { void useChat.getState().refreshContext(); setDialog("history"); }} title="Past chats" aria-label="Past chats" className="grid size-7 place-items-center rounded-full text-text-secondary hover:bg-surface-secondary"><History size={15} /></button>
      {dialog === "projects" && <ProjectsDialog onClose={() => setDialog(null)} />}
      {dialog === "history" && <HistoryDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function ProjectsDialog({ onClose }: { onClose: () => void }) {
  useHidePage();
  const projects = useChat((s) => s.projects);
  const [editing, setEditing] = useState<{ id?: number; name: string; notes: string } | null>(projects.length ? null : { name: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!editing) return;
    try {
      const id = await ipc.ctxProjectSave(editing);
      await useChat.getState().refreshContext();
      if (!editing.id && id) await useChat.getState().setProject(id);
      setEditing(null); setError(null);
    } catch (e) { setError(String(e)); }
  };
  return (
    <Modal onClose={onClose} label="Projects" width="max-w-lg">
      <ModalHeader title="Projects" onClose={onClose} />
      <div className="space-y-3 p-5 text-[13px]">
        <p className="text-text-secondary">A project is a few notes about what you're working on. The assistant reads the active project with every request, in Ask, Do tasks and Screen mode, so it keeps your context. Notes stay on this computer.</p>
        {editing ? (
          <div className="space-y-2">
            <input autoFocus value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Project name (e.g. Science fair)" aria-label="Project name" className="w-full rounded-xl border border-border bg-surface px-3 py-2" />
            <textarea value={editing.notes} maxLength={8000} rows={6} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="What is it? Where are the files? What should I remember? (Don't put passwords here.)" aria-label="Project notes" className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2" />
            {error && <p className="text-red-500" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              {projects.length > 0 && <button type="button" onClick={() => { setEditing(null); setError(null); }} className="rounded-full border border-border px-4 py-1.5 hover:bg-surface-secondary">Cancel</button>}
              <button type="button" disabled={!editing.name.trim()} onClick={() => void save()} className="rounded-full bg-primary px-4 py-1.5 font-medium text-white disabled:opacity-50 dark:text-bg">Save project</button>
            </div>
          </div>
        ) : (
          <>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ id: p.id, name: p.name, notes: p.notes })}>
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-[12px] text-text-secondary">{p.notes || "No notes yet"}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${p.name}`} title="Delete project" onClick={async () => { await ipc.ctxProjectDelete(p.id); await useChat.getState().refreshContext(); }} className="grid size-7 place-items-center rounded-full text-text-secondary hover:bg-surface-secondary"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setEditing({ name: "", notes: "" })} className="rounded-full bg-primary px-4 py-1.5 font-medium text-white dark:text-bg">New project</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function HistoryDialog({ onClose }: { onClose: () => void }) {
  useHidePage();
  const { chats, chatId, projects } = useChat();
  return (
    <Modal onClose={onClose} label="Past chats" width="max-w-lg">
      <ModalHeader title="Past chats" onClose={onClose} />
      <div className="p-5 text-[13px]">
        {chats.length === 0 ? <p className="text-text-secondary">No saved chats yet. They appear here after your first message.</p> : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {chats.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={async () => { await useChat.getState().openChat(c.id); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-surface-secondary ${c.id === chatId ? "border-primary" : "border-border"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title || "Untitled chat"}</span>
                    <span className="block truncate text-[12px] text-text-secondary">{projects.find((p) => p.id === c.project_id)?.name ?? "No project"} · {c.messages} messages · {formatBytes(c.bytes)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-text-secondary" title={new Date(c.last_used * 1000).toLocaleString()}>{lastUsedLabel(c.last_used)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-text-secondary">Free up space any time in Settings → Storage.</p>
      </div>
    </Modal>
  );
}
