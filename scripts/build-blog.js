// Build step run by Netlify: copies the site into /dist, turns every
// content/blog/*.md post into /dist/blog/<slug>.html and writes /dist/posts.json.
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE = "https://www.certpedia.in";
const SKIP = new Set(["node_modules", "dist", "scripts", "content", ".git", ".gitignore", "package.json", "package-lock.json", "netlify.toml"]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function unquote(v) {
  v = v.trim();
  if (v.length > 1 && v[0] === '"' && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\\\/g, "\\");
  if (v.length > 1 && v[0] === "'" && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
function parsePost(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return null;
  const meta = {}; let key = null;
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv && !/^\s/.test(line)) { key = kv[1]; meta[key] = kv[2]; }
    else if (key && /^\s+\S/.test(line)) meta[key] += " " + line.trim();
  });
  Object.keys(meta).forEach((k) => {
    let v = meta[k].trim();
    if (/^[>|][+-]?\s/.test(v + " ")) v = v.replace(/^[>|][+-]?\s*/, "");
    meta[k] = unquote(v);
  });
  return { meta, body: m[2] };
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((e) => {
    if (src === ROOT && SKIP.has(e.name)) return;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}
function fmt(d) {
  const p = d.split("-"); const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return p.length === 3 ? +p[2] + " " + m[+p[1] - 1] + " " + p[0] : d;
}
function page(p, html) {
  const url = SITE + "/blog/" + p.slug + ".html";
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.summary,
    datePublished: p.date, mainEntityOfPublishedPage: url, articleSection: p.cat,
    author: { "@type": "Organization", name: "Certpedia" },
    publisher: { "@type": "Organization", name: "Certpedia", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } }
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)} | Certpedia Blog</title>
<meta name="description" content="${esc(p.summary)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#1A4DF0">
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:type" content="article"><meta property="og:site_name" content="Certpedia"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.summary)}"><meta property="og:url" content="${url}">
<script type="application/ld+json">${ld}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/blog.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Certpedia home"><img src="/logo.png" alt="Certpedia" width="58" height="64"></a>
  <nav class="nav" aria-label="Primary"><a href="/">Home</a><a href="/view-all-services.html">Services</a><a href="/blog.html" aria-current="page">Blog</a><a class="btn" href="https://www.certpedia.in/Contact-us">Free consultation</a></nav>
</div></header>
<main><div class="wrap"><article class="art">
  <div class="crumb"><a href="/blog.html">&larr; All posts</a></div>
  <span class="tag">${esc(p.cat)}</span>
  <h1>${esc(p.title)}</h1>
  <div class="by"><time datetime="${esc(p.date)}">${fmt(p.date)}</time> &middot; Certpedia</div>
  <div class="content">${html}</div>
  <div class="cta"><b>Need help with this approval?</b><a class="btn" href="https://www.certpedia.in/Contact-us">Free consultation</a></div>
</article></div></main>
<footer><div class="wrap">
  <span>&copy; 2026 Technocrats Network Private Limited &middot; C-127, Sector 2, Noida 201301</span>
  <span><a href="tel:+919311324939">+91 93113 24939</a> &middot; <a href="mailto:support@certpedia.in">support@certpedia.in</a></span>
</div></footer>
</body>
</html>
`;
}

fs.rmSync(DIST, { recursive: true, force: true });
copyDir(ROOT, DIST);
fs.mkdirSync(path.join(DIST, "blog"), { recursive: true });

const dir = path.join(ROOT, "content", "blog");
const posts = [];
(fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith(".md")).forEach((f) => {
  const parsed = parsePost(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!parsed || !parsed.meta.title) { console.warn("Skipping " + f + " (no title)"); return; }
  const m = parsed.meta;
  const p = {
    slug: f.replace(/\.md$/, ""), title: m.title, date: (m.date || "").slice(0, 10) || "2000-01-01",
    cat: m.cat || "General", summary: m.summary || ""
  };
  const html = marked.parse(parsed.body);
  fs.writeFileSync(path.join(DIST, "blog", p.slug + ".html"), page(p, html));
  posts.push({
    title: p.title, date: p.date, cat: p.cat, summary: p.summary, url: "blog/" + p.slug + ".html",
    text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000)
  });
});
posts.sort((a, b) => (a.date < b.date ? 1 : -1));
fs.writeFileSync(path.join(DIST, "posts.json"), JSON.stringify(posts));

const urls = posts.map((p) => `<url><loc>${SITE}/${p.url}</loc><lastmod>${p.date}</lastmod></url>`).join("");
fs.writeFileSync(path.join(DIST, "sitemap-blog.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/blog.html</loc></url>${urls}</urlset>`);
console.log("Built " + posts.length + " blog post(s) into dist/");
