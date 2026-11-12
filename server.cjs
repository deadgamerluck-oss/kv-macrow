const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const STATIC_DIR = path.join(ROOT, "dist");
const DATA_DIR = path.join(ROOT, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.jsonl");
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 16 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 8;
const requestCounts = new Map();
let writeQueue = Promise.resolve();

const FORM_NAMES = {
  form1: "Form 1 — Hero offer",
  form2: "Form 2 — Course details",
  form3: "Form 3 — Syllabus and batch details",
  form4: "Form 4 — Fee callback",
  form5: "Form 5 — Counselling modal",
};
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}
function clean(value, max = 500) {
  return String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, max);
}
function isRateLimited(req) {
  const ip = clean(req.socket.remoteAddress || "unknown", 80);
  const now = Date.now();
  const entry = requestCounts.get(ip) || { start: now, count: 0 };
  if (now - entry.start > WINDOW_MS) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count++;
  requestCounts.set(ip, entry);
  return entry.count > MAX_REQUESTS;
}
async function saveLead(lead) {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
  });
  return writeQueue;
}
async function exportCsv(req, res, url) {
  const supplied = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const expected = Buffer.from(String(process.env.ADMIN_TOKEN || ""));
  if (
    !expected.length ||
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }
  let rows = [];
  try {
    rows = (await fs.readFile(LEADS_FILE, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT")
      return sendJson(res, 500, { error: "Could not read lead store" });
  }
  const fields = [
    "id",
    "created_at",
    "form_id",
    "form_name",
    "name",
    "phone",
    "city",
    "offer",
    "mode",
    "goal",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "landing_page",
    "referrer",
  ];
  const quote = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const csv = [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => quote(row[field])).join(",")),
  ].join("\r\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="kshitij-vivan-leads.csv"',
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(csv);
}
async function serveFile(url, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: "Invalid path" });
  }
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(STATIC_DIR, "." + pathname);
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep))
    return sendJson(res, 403, { error: "Forbidden" });
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return sendJson(res, 404, { error: "Not found" });
    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        path.extname(file) === ".html" ? "no-cache" : "public, max-age=86400",
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health")
    return sendJson(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/admin/leads.csv")
    return exportCsv(req, res, url);
  if (req.method === "POST" && url.pathname === "/api/leads") {
    if (isRateLimited(req))
      return sendJson(res, 429, {
        error: "Too many submissions. Please try again later.",
      });
    try {
      const input = await parseBody(req);
      if (clean(input.website, 200)) return sendJson(res, 200, { ok: true });
      const formId = clean(input.form_id, 20);
      const name = clean(input.name, 120);
      const phone = clean(input.phone, 20).replace(/[\s()-]/g, "");
      if (!FORM_NAMES[formId])
        return sendJson(res, 400, { error: "Unknown enquiry form." });
      if (name.length < 2)
        return sendJson(res, 400, { error: "Please enter your name." });
      if (!/^[6-9]\d{9}$/.test(phone))
        return sendJson(res, 400, {
          error: "Please enter a valid 10-digit Indian mobile number.",
        });
      const lead = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        form_id: formId,
        form_name: FORM_NAMES[formId],
        name,
        phone,
        city: clean(input.city, 120),
        offer: clean(input.offer, 200),
        mode: clean(input.mode, 100),
        goal: clean(input.goal, 160),
        utm_source: clean(input.utm_source, 160),
        utm_medium: clean(input.utm_medium, 160),
        utm_campaign: clean(input.utm_campaign, 200),
        utm_content: clean(input.utm_content, 200),
        utm_term: clean(input.utm_term, 200),
        landing_page: clean(input.landing_page, 500),
        referrer: clean(input.referrer, 500),
      };
      await saveLead(lead);
      return sendJson(res, 201, { ok: true, id: lead.id, form_id: formId });
    } catch (error) {
      return sendJson(res, error.status || 500, {
        error: error.status
          ? error.message
          : "Could not save your enquiry. Please try again.",
      });
    }
  }
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJson(res, 405, { error: "Method not allowed" });
  return serveFile(url, res);
});
server.listen(PORT, () =>
  console.log(`Kshitij Vivan React app listening on port ${PORT}`),
);
