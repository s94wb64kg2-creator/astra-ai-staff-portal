const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "applications.json");

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
  console.error("Set SESSION_SECRET and ADMIN_PASSWORD in your environment.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "astra.staff.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const applicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many applications from this connection. Please try again later."
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const QUESTIONS = [
  "What is your Discord username?",
  "How old are you?",
  "What timezone are you in?",
  "Why do you want to become a manager?",
  "Do you have any previous staff experience?",
  "How active can you be in the server each day?",
  "How would you deal with someone breaking the server rules?",
  "How would you handle an argument between two staff members?",
  "What new ideas would you bring to Astra AI?",
  "Why should we choose you over other applicants?"
];

function readApps() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function writeApps(apps) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2));
}
function clean(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/login");
}

app.post("/api/apply", applicationLimiter, async (req, res) => {
  const answers = QUESTIONS.map((_, i) => clean(req.body[`q${i + 1}`], i >= 3 ? 1200 : 120));
  if (answers.some(a => !a)) {
    return res.status(400).send("Please answer all 10 questions. Go back and check your form.");
  }

  const application = {
    id: `AST-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "Pending",
    answers
  };
  const apps = readApps();
  apps.unshift(application);
  writeApps(apps);

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && webhook.startsWith("https://discord.com/api/webhooks/")) {
    const fields = [
      { name: "Application ID", value: application.id, inline: true },
      { name: "Discord username", value: answers[0].slice(0, 200), inline: true },
      ...QUESTIONS.slice(1).map((q, i) => ({
        name: `${i + 2}. ${q}`.slice(0, 256),
        value: answers[i + 1].slice(0, 1000),
        inline: false
      }))
    ];
    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Astra AI Applications",
          embeds: [{
            title: "New Manager Application",
            description: `**${application.id}** • Status: Pending`,
            color: 0x8B5CF6,
            fields,
            timestamp: application.createdAt,
            footer: { text: "Astra AI Staff Portal" }
          }]
        })
      });
      if (!response.ok) console.error("Discord webhook returned:", response.status);
    } catch (err) {
      console.error("Could not send Discord notification:", err.message);
    }
  }

  res.sendFile(path.join(__dirname, "public", "submitted.html"));
});

app.get("/login", (req, res) => {
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff Login | Astra AI</title><link rel="stylesheet" href="/styles.css"></head><body class="admin-bg"><main class="login-card"><a class="brand" href="/">✦ ASTRA AI</a><p class="eyebrow">STAFF ACCESS</p><h1>Dashboard login</h1><p class="muted">Sign in to review manager applications.</p><form method="post" action="/login"><label>Dashboard password<input type="password" name="password" required autocomplete="current-password"></label><button class="primary full" type="submit">Sign in</button></form><a class="back-link" href="/">← Back to applications</a></main></body></html>`);
});
app.post("/login", loginLimiter, (req, res) => {
  if (clean(req.body.password, 300) !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send("Incorrect password. <a href='/login'>Try again</a>.");
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).send("Could not start session.");
    req.session.isAdmin = true;
    res.redirect("/dashboard");
  });
});
app.post("/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/dashboard", requireAdmin, (req, res) => {
  const apps = readApps();
  const rows = apps.map(a => `
    <article class="application-card">
      <div class="app-top"><div><span class="app-id">${escapeHtml(a.id)}</span><span class="status ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span></div><time>${escapeHtml(new Date(a.createdAt).toLocaleString())}</time></div>
      <h2>${escapeHtml(a.answers[0])}</h2>
      <details><summary>Read all 10 answers</summary><div class="answers">${QUESTIONS.map((q,i)=>`<div class="answer"><strong>${i+1}. ${escapeHtml(q)}</strong><p>${escapeHtml(a.answers[i])}</p></div>`).join("")}</div></details>
      <div class="actions">
        <form method="post" action="/applications/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="Accepted"><button class="approve" type="submit">Accept</button></form>
        <form method="post" action="/applications/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="Rejected"><button class="reject" type="submit">Reject</button></form>
        <form method="post" action="/applications/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="Pending"><button class="neutral" type="submit">Mark pending</button></form>
      </div>
    </article>`).join("");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard | Astra AI</title><link rel="stylesheet" href="/styles.css"></head><body><header class="topbar"><a class="brand" href="/">✦ ASTRA AI</a><nav><span class="nav-label">STAFF DASHBOARD</span><form method="post" action="/logout"><button class="logout" type="submit">Log out</button></form></nav></header><main class="dashboard wrap"><div class="dash-heading"><div><p class="eyebrow">RECRUITMENT CONTROL</p><h1>Applications</h1><p class="muted">Review applicants and update their status.</p></div><div class="stat"><strong>${apps.length}</strong><span>Total applications</span></div></div><div class="filter-row"><span>All applications</span><span>Newest first</span></div>${rows || `<div class="empty"><div class="empty-icon">✦</div><h2>No applications yet</h2><p>New manager applications will appear here.</p></div>`}</main></body></html>`);
});

app.post("/applications/:id/status", requireAdmin, (req, res) => {
  const status = clean(req.body.status, 20);
  if (!["Pending", "Accepted", "Rejected"].includes(status)) return res.status(400).send("Invalid status.");
  const apps = readApps();
  const target = apps.find(a => a.id === req.params.id);
  if (!target) return res.status(404).send("Application not found.");
  target.status = status;
  writeApps(apps);
  res.redirect("/dashboard");
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Astra AI Staff Portal running on port ${PORT}`));
