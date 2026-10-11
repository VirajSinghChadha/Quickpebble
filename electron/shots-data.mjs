// Sample content for the screenshot run (QP_SMOKE_SHOTS=1): theme names and small pages served from this computer.
// Everything here is made up for the screenshots: a demo school, a demo page with ads and demo shops with demo prices.
export const PRESETS_FOR_SHOTS = [
  { id: "pebble", label: "Pebble" }, { id: "ocean", label: "Ocean" }, { id: "forest", label: "Forest" }, { id: "sunset", label: "Sunset" },
  { id: "lavender", label: "Lavender" }, { id: "rose", label: "Rose" }, { id: "graphite", label: "Graphite" },
  { id: "aurora", label: "Aurora (teal + violet)" }, { id: "sunrise", label: "Sunrise (orange + pink)" }, { id: "twilight", label: "Twilight (indigo + cyan)" },
];

const page = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}<style>body{font:16px/1.55 -apple-system,Segoe UI,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1f2937}h1{font-size:28px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e5e7eb;padding:8px;text-align:left}th{background:#f3f4f6}.ad{border:1px solid #fde68a;background:#fffbeb;padding:12px;border-radius:10px;margin:16px 0}.tag{font-size:12px;color:#92400e;text-transform:uppercase}li{margin:10px 0}.price{font-weight:700}</style></head><body>${body}</body></html>`;

const shop = (name, items) => () => page(`Search results · ${name}`, `<h1>${name}</h1><p>Results for “Wireless headphones WH-200”</p><ul>${items.map((i) => `<li><a href="/p/${encodeURIComponent(i.t)}">${i.t}</a> <span class="price">AED ${i.p}</span> · ${i.s}${i.d ? ` · ${i.d}` : ""}</li>`).join("")}</ul>`);

export const PAGES = {
  "/school/timetable": () => page("My timetable · Demo School portal", `<h1>Demo School portal</h1><h2>My timetable, Grade 8B</h2>
    <table><tr><th>Time</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
    <tr><td>08:00–08:45</td><td>Maths (B12)</td><td>English (A3)</td><td>Science (Lab 2)</td><td>Maths (B12)</td><td>Art (Studio)</td></tr>
    <tr><td>08:50–09:35</td><td>Science (Lab 2)</td><td>History (A7)</td><td>Maths (B12)</td><td>English (A3)</td><td>PE (Gym)</td></tr>
    <tr><td>09:55–10:40</td><td>Arabic (C4)</td><td>Science (Lab 2)</td><td>Geography (A5)</td><td>Music (M1)</td><td>Maths (B12)</td></tr></table>
    <p><a href="#">Download PDF</a></p>`),
  "/miracle-diet": () => page("Lose 10 kg in a week with this one trick", `<h1>Lose 10 kg in a week with this one trick</h1>
    <div class="ad"><span class="tag">Sponsored</span><h3>Miracle Slim Tea: 50% off today</h3><a rel="sponsored" href="https://shop.example/tea">Buy now</a></div>
    <p>Doctors hate it: drink this tea every morning and the weight just disappears.</p><img src="https://www.google-analytics.com/collect?v=1" width="1" height="1" alt="">
    <img src="https://connect.facebook.net/en_US/fbevents.js" width="1" height="1" alt=""><footer>© 2019 Wellness Wow Media. All rights reserved.</footer>`,
    `<script type="application/ld+json">{"@type":"Article","datePublished":"2019-02-01","dateModified":"2019-03-04","publisher":{"name":"Wellness Wow Media"}}</script>`),
  "/shop-a": shop("Demo Electronics", [{ t: "WH-200 Wireless Noise-Cancelling Headphones, Black", p: "549.00", s: "In stock", d: "Free delivery tomorrow" }, { t: "WH-200 Replacement ear cushions", p: "59.00", s: "In stock" }]),
  "/shop-b": shop("Example Mart", [{ t: "WH-200 Wireless Noise-Cancelling Headphones (Renewed)", p: "399.00", s: "In stock" }, { t: "WH-200 Wireless Noise-Cancelling Headphones, Silver", p: "579.00", s: "Only 2 left", d: "Delivery in 2–3 days" }]),
  "/shop-c": shop("Sample Store", [{ t: "Wireless Headphones WH-200 Noise Cancelling, Black", p: "529.00", s: "In stock", d: "Free delivery" }]),
  "/shop-robot": () => page("Robot check", "<p>Please verify you are human. Complete the captcha to continue.</p>"),
};
