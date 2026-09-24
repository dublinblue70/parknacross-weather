import { readFile, writeFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

const root = new URL("./", import.meta.url);
const top = [
  ["index.html", "Dashboard"], ["summary.html", "Summary"],
  ["radar.html", "Radar"], ["graphs.html", "Graphs"],
  ["rain.html", "Rain"], ["history.html", "History"]
];
const more = [
  ["climate.html", "Climate"], ["station.html", "Station"],
  ["coast.html", "Coastal"], ["sky.html", "Today’s sky"],
  ["records.html", "Records"], ["monthly.html", "Monthly report"],
  ["annual.html", "Annual report"], ["downloads.html", "Downloads"],
  ["status.html", "System status"], ["install.html", "Install help"],
  ["privacy.html", "Privacy"]
];
const landingPages = new Set([
  "ardamine-weather.html", "courtown-weather.html",
  "north-wexford-weather.html", "north-wexford-coastal-weather.html"
]);

function navigation(page) {
  const topActive = landingPages.has(page) ? "index.html" : page;
  const topLinks = top.map(([href, label]) =>
    `<a href="${href}"${href === topActive ? ' class="active" aria-current="page"' : ""}>${label}</a>`
  ).join("");
  const secondaryActive = more.some(([href]) => href === page);
  const moreLinks = more.map(([href, label]) =>
    `<a role="menuitem" href="${href}"${href === page ? ' class="active" aria-current="page"' : ""}>${label}</a>`
  ).join("");
  return `<nav class="nav" aria-label="Main navigation">${topLinks}<div class="nav-more"><button class="nav-more-button${secondaryActive ? " nav-more-active" : ""}" type="button" aria-expanded="false" aria-haspopup="menu">More <span aria-hidden="true">▾</span></button><div class="nav-more-menu" role="menu" hidden>${moreLinks}</div></div></nav>`;
}

const footerLinks = `<nav class="footer-links" aria-label="Parknacross Weather links"><a href="mailto:info@parknacrossweather.ie" aria-label="Email Parknacross Weather">Email</a><span aria-hidden="true">·</span><a href="https://www.facebook.com/1361994206992789" target="_blank" rel="noopener noreferrer" aria-label="Parknacross Weather on Facebook">Facebook</a><span aria-hidden="true">·</span><a href="https://x.com/ParknacrossWx" target="_blank" rel="noopener noreferrer" aria-label="Parknacross Weather on X, @ParknacrossWx">X</a><span aria-hidden="true">·</span><a href="install.html">Install help</a><span aria-hidden="true">·</span><a href="privacy.html">Privacy</a></nav>`;

for (const entry of await readdir(root)) {
  if (!entry.endsWith(".html") || entry === "offline.html") continue;
  const url = new URL(entry, root);
  let html = await readFile(url, "utf8");
  html = html.replace(/<nav class="nav" aria-label="Main navigation">[\s\S]*?<\/nav>/, navigation(basename(entry)));
  html = html.replace(/<nav\s+class="footer-links"[\s\S]*?<\/nav>/, footerLinks);
  await writeFile(url, html);
}
