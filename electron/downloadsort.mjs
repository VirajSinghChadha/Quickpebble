// Optional tidying of finished downloads: sort into folders by kind, and give unclear file names a clearer one.
// Pure helpers (no electron) so the rules can be tested. Nothing here runs unless the person turned it on in Settings.
import path from "node:path";

const KINDS = {
  Images: "jpg jpeg png gif webp heic heif bmp tif tiff svg avif ico raw",
  PDFs: "pdf",
  Documents: "doc docx odt rtf txt md pages epub tex",
  Spreadsheets: "xls xlsx csv ods numbers tsv",
  Presentations: "ppt pptx odp key",
  Archives: "zip rar 7z tar gz tgz bz2 xz",
  Installers: "dmg pkg mpkg iso msi exe appimage deb rpm",
  Audio: "mp3 wav aac flac m4a ogg opus aiff",
  Video: "mp4 mov mkv avi webm m4v wmv flv",
  Code: "js ts tsx jsx py rb go rs java c cpp h css html json xml yaml yml sh ipynb sql",
  Fonts: "ttf otf woff woff2",
};
const BY_EXT = new Map(Object.entries(KINDS).flatMap(([kind, exts]) => exts.split(" ").map((e) => [e, kind])));
export const FOLDER_NAMES = new Set([...Object.keys(KINDS), "Other"]);

/** Which folder a file belongs in, from its extension alone (we never open files). */
export const categoryOf = (filename) => BY_EXT.get(path.extname(String(filename)).slice(1).toLowerCase()) ?? "Other";

/** Names that tell you nothing about the file: "download", "image (3)", a long hash, a UUID, or just numbers. */
export function isGenericName(filename) {
  const stem = path.basename(String(filename), path.extname(String(filename))).trim().toLowerCase();
  if (!stem || /^\.[a-z0-9]{1,5}$/.test(stem)) return true;
  const bare = stem.replace(/\s*\(\d+\)$/, "").replace(/[\s_-]+\d*$/, "");
  if (["download", "file", "document", "image", "images", "unnamed", "untitled", "attachment", "export", "report", "data", "index", "output", "result", "photo", "scan", "unknown", "new file", ""].includes(bare)) return true;
  if (/^[0-9a-f]{24,}$/.test(stem) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(stem)) return true;
  if (/^[\d\s._-]{4,}$/.test(stem)) return true;
  return false;
}

/** Where a finished download goes. Only files that sit directly in the Downloads folder are ever moved. */
export function plannedPath(downloadsDir, currentPath, exists) {
  if (path.dirname(path.resolve(currentPath)) !== path.resolve(downloadsDir)) return null;
  const name = path.basename(currentPath);
  const folder = path.join(downloadsDir, categoryOf(name));
  const first = path.join(folder, name);
  if (!exists(first)) return first;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  for (let n = 1; n < 1000; n++) { const p = path.join(folder, `${stem} (${n})${ext}`); if (!exists(p)) return p; }
  return null;
}

/** A model's suggested name becomes a safe file name: words only, no extension, no path, short. Null if it isn't usable. */
export function cleanSuggestion(reply, ext) {
  const t = String(reply ?? "").split("\n")[0].replace(/^["'`“”\s]+|["'`“”\s]+$/g, "").replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "");
  const words = t.replace(/[\\/:*?"<>|]/g, " ").replace(/[^\p{L}\p{N}\s._()-]/gu, " ").replace(/\s+/g, " ").trim().replace(/^[\s.]+/, "");
  if (words.length < 3 || words.length > 90 || /^(download|file|document|untitled|unknown)$/i.test(words)) return null;
  return `${words.slice(0, 60).trim()}${ext}`;
}

