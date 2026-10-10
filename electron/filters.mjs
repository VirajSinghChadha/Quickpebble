// uBlock-grade filter lists (EasyList, EasyPrivacy, uBO and friends via Ghostery's prebuilt engine), matched natively on
// every request. The compiled engine is cached on disk and refreshed daily; until it loads, the built-in tracker list applies.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { FiltersEngine, Request } from "@ghostery/adblocker";

const DAY = 24 * 3600 * 1000;
const TYPES = { script: "script", image: "image", stylesheet: "stylesheet", xhr: "xmlhttprequest", subFrame: "sub_frame", media: "media", font: "font", ping: "ping", webSocket: "websocket", cspReport: "csp_report", object: "object", other: "other" };

export class Filters {
  constructor() { this.engine = null; this.updatedAt = 0; }
  get file() { return path.join(app.getPath("userData"), "filters.bin"); }

  /** Loads the cached engine immediately, then refreshes it in the background if it's more than a day old. */
  async start() {
    try {
      const st = fs.statSync(this.file);
      this.engine = FiltersEngine.deserialize(new Uint8Array(fs.readFileSync(this.file)));
      this.updatedAt = st.mtimeMs;
    } catch { /* first run, or an engine from an older version */ }
    if (!this.engine || Date.now() - this.updatedAt > DAY) await this.refresh().catch(() => {});
    setInterval(() => { if (Date.now() - this.updatedAt > DAY) this.refresh().catch(() => {}); }, 3600 * 1000).unref?.();
  }
  async refresh() {
    const engine = await FiltersEngine.fromPrebuiltAdsAndTracking(fetch);
    this.engine = engine;
    this.updatedAt = Date.now();
    try { fs.writeFileSync(this.file, engine.serialize()); } catch { /* cache is optional */ }
  }
  /** (url, host, resourceType, topHost) => boolean, for adblock.mjs. */
  matcher() {
    const engine = this.engine;
    if (!engine) return null;
    return (url, _host, type, top) => {
      try {
        const req = Request.fromRawDetails({ url, sourceUrl: top ? `https://${top}/` : undefined, type: TYPES[type] ?? "other" });
        return engine.match(req).match;
      } catch { return false; }
    };
  }
  get ready() { return !!this.engine; }
}
