// "Answer from my files": the person picks folders (notes, PDFs, documents) and Quick Pebble keeps a full-text index of them in
// its own database on this computer. Nothing leaves the computer here; the assistant only sends the excerpts it found, after the
// person approves the plan that lists them. Sizes and counts are capped, and protected folders are never read.
import fsp from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { checkRoot, isInside } from "./fsguard.mjs";
import { ftsQuery } from "./recall.mjs";

export const LIMITS = { folders: 20, filesPerFolder: 5000, bytesPerFile: 25 * 1024 * 1024, textPerFile: 400_000, depth: 8 };
const TEXT = /\.(txt|md|markdown|csv|tsv|json|log|org|tex|yaml|yml)$/i;
const HTML = /\.(html?|xhtml)$/i;
export const READABLE = /\.(txt|md|markdown|csv|tsv|json|log|org|tex|yaml|yml|html?|xhtml|rtf|docx|pdf)$/i;
const now = () => Math.floor(Date.now() / 1000);

/** Plain text out of HTML: drop scripts and styles, tags, and decode the common entities. */
export function htmlText(html) {
  return String(html).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n\s*\n+/g, "\n").trim();
}

/** Plain text out of RTF: good enough for searching (control words and groups removed). */
export function rtfText(rtf) {
  return String(rtf).replace(/\\par[d]?/g, "\n").replace(/\{\\\*[^{}]*\}/g, "").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "").replace(/[ \t]+/g, " ").trim();
}

/** Text of a Word .docx (it's a zip; the words are in word/document.xml). */
export function docxText(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) return "";
  return strFromU8(xml).replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

let pdfjs = null;
/** Text of a PDF, page by page (Mozilla's PDF.js, the same reader Firefox uses). Scanned PDFs have no text and give "". */
export async function pdfText(buf, maxChars = LIMITS.textPerFile) {
  pdfjs ??= await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  let out = "";
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 300) && out.length < maxChars; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += `${content.items.map((i) => i.str ?? "").join(" ")}\n`;
    }
  } finally { await doc.destroy(); }
  return out.replace(/[ \t]+/g, " ").trim();
}

/** Readable text of one file, by its extension. Empty when there's nothing to read. */
export async function fileText(p, read = fsp.readFile) {
  const buf = await read(p);
  let t = "";
  if (TEXT.test(p)) t = buf.toString("utf8");
  else if (HTML.test(p)) t = htmlText(buf.toString("utf8"));
  else if (/\.rtf$/i.test(p)) t = rtfText(buf.toString("utf8"));
  else if (/\.docx$/i.test(p)) t = docxText(buf);
  else if (/\.pdf$/i.test(p)) t = await pdfText(buf);
  return t.replace(/\u0000/g, "").slice(0, LIMITS.textPerFile);
}

export class FileIndex {
  constructor(db, { guarded = () => [] } = {}) {
    this.db = db; this.guarded = guarded; this.busy = null;
    db.d.exec(`CREATE TABLE IF NOT EXISTS file_folders (path TEXT PRIMARY KEY, files INTEGER NOT NULL DEFAULT 0, indexed_at INTEGER, skipped INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS file_meta (path TEXT PRIMARY KEY, folder TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(path UNINDEXED, name, body, tokenize = 'porter unicode61');`);
  }

  folders() { return this.db.all("SELECT path, files, indexed_at, skipped FROM file_folders ORDER BY path").map((r) => ({ ...r, files: Number(r.files), indexed_at: r.indexed_at == null ? null : Number(r.indexed_at), skipped: Number(r.skipped) })); }

  addFolder(dir) {
    const problem = checkRoot(dir, { guarded: this.guarded() });
    if (problem) throw new Error(problem);
    const d = path.resolve(dir);
    if (this.folders().length >= LIMITS.folders) throw new Error(`You can add up to ${LIMITS.folders} folders.`);
    this.db.run("INSERT OR IGNORE INTO file_folders (path) VALUES (?1)", d);
    return d;
  }

  removeFolder(dir) {
    const d = path.resolve(String(dir));
    this.db.d.exec("BEGIN");
    try {
      for (const r of this.db.all("SELECT path FROM file_meta WHERE folder = ?1", d)) this.db.run("DELETE FROM file_fts WHERE path = ?1", r.path);
      this.db.run("DELETE FROM file_meta WHERE folder = ?1", d);
      this.db.run("DELETE FROM file_folders WHERE path = ?1", d);
      this.db.d.exec("COMMIT");
    } catch (e) { this.db.d.exec("ROLLBACK"); throw e; }
  }

  /** Brings one folder's index up to date: new and changed files are read, deleted ones dropped. Unchanged files are skipped. */
  async indexFolder(dir, { onProgress } = {}) {
    const d = path.resolve(dir);
    if (!this.db.get("SELECT 1 AS x FROM file_folders WHERE path = ?1", d)) throw new Error("That folder isn't in the list.");
    const guarded = this.guarded();
    const found = [];
    const walk = async (p, depth) => {
      if (depth > LIMITS.depth || found.length >= LIMITS.filesPerFolder) return;
      for (const e of await fsp.readdir(p, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
        const full = path.join(p, e.name);
        if (guarded.some((g) => isInside(full, g))) continue;
        if (e.isDirectory()) { if (e.name !== "node_modules" && !/\.(app|photoslibrary)$/i.test(e.name)) await walk(full, depth + 1); }
        else if (e.isFile() && READABLE.test(e.name)) found.push(full);
        if (found.length >= LIMITS.filesPerFolder) return;
      }
    };
    await walk(d, 0);
    const known = new Map(this.db.all("SELECT path, mtime, size FROM file_meta WHERE folder = ?1", d).map((r) => [r.path, r]));
    let skipped = 0, done = 0;
    for (const f of found) {
      known.delete(f);
      const st = await fsp.stat(f).catch(() => null);
      if (!st) continue;
      const prev = this.db.get("SELECT mtime, size FROM file_meta WHERE path = ?1", f);
      if (prev && Number(prev.mtime) === Math.floor(st.mtimeMs) && Number(prev.size) === st.size) { done++; continue; }
      if (st.size > LIMITS.bytesPerFile) { skipped++; continue; }
      let text = "";
      try { text = await fileText(f); } catch { skipped++; continue; }
      this.db.run("DELETE FROM file_fts WHERE path = ?1", f);
      if (text.trim()) this.db.run("INSERT INTO file_fts (path, name, body) VALUES (?1, ?2, ?3)", f, path.basename(f), text);
      this.db.run("INSERT OR REPLACE INTO file_meta (path, folder, mtime, size) VALUES (?1, ?2, ?3, ?4)", f, d, Math.floor(st.mtimeMs), st.size);
      if (++done % 25 === 0) onProgress?.(done, found.length);
    }
    for (const gone of known.keys()) { this.db.run("DELETE FROM file_fts WHERE path = ?1", gone); this.db.run("DELETE FROM file_meta WHERE path = ?1", gone); }
    const files = Number(this.db.get("SELECT count(*) AS n FROM file_meta WHERE folder = ?1", d).n);
    this.db.run("UPDATE file_folders SET files = ?2, indexed_at = ?3, skipped = ?4 WHERE path = ?1", d, files, now(), skipped);
    return { files, skipped, capped: found.length >= LIMITS.filesPerFolder };
  }

  async indexAll(opts) {
    if (this.busy) return this.busy;
    this.busy = (async () => { const out = []; for (const f of this.folders()) out.push({ path: f.path, ...(await this.indexFolder(f.path, opts)) }); return out; })().finally(() => { this.busy = null; });
    return this.busy;
  }

  /** Best matching excerpts. Files in folders that became protected since indexing are left out. */
  search(query, limit = 6) {
    const expr = ftsQuery(String(query ?? ""));
    if (!expr) return [];
    const guarded = this.guarded();
    return this.db.all(`SELECT path, name, snippet(file_fts, 2, '', '', ' … ', 60) AS snippet FROM file_fts WHERE file_fts MATCH ?1 ORDER BY bm25(file_fts, 0.0, 4.0, 1.0) LIMIT ?2`, expr, Math.min(20, Math.max(1, limit) * 2))
      .filter((r) => !guarded.some((g) => isInside(r.path, g))).slice(0, limit);
  }

  stats() { return { folders: this.folders().length, files: Number(this.db.get("SELECT count(*) AS n FROM file_meta").n) }; }

  commands(dialog) {
    return {
      files_folders: () => this.folders(),
      files_add_folder: async (w) => {
        const r = await dialog.showOpenDialog(w.win, { title: "Choose a folder for the assistant to answer from", properties: ["openDirectory"] });
        if (r.canceled || !r.filePaths[0]) return null;
        const d = this.addFolder(r.filePaths[0]);
        await this.indexFolder(d);
        return this.folders();
      },
      files_remove_folder: (_w, { path: p }) => { this.removeFolder(p); return this.folders(); },
      files_reindex: () => this.indexAll(),
      files_search: (_w, { query, limit }) => this.search(query, limit ?? 6),
    };
  }
}
