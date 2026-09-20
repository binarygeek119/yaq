import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(dir, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    if (pkg.version) return pkg.version;
  } catch {
    // Packaged builds inject the version at bundle time.
  }
  return "0.0.0";
}

/** App version from package.json (inlined by the binary bundle). */
export const YAQ_VERSION: string =
  typeof process.env.YAQ_VERSION === "string" && process.env.YAQ_VERSION
    ? process.env.YAQ_VERSION
    : readPackageVersion();

/** Stamp the running version into the SPA shell so /admin can show it
 * even when the browser is on a stale client/dist build. */
export function injectYaqVersionHtml(html: string): string {
  const versionLiteral = JSON.stringify(YAQ_VERSION);
  const snippet = `<script>window.__YAQ_VERSION__=${versionLiteral};</script>
<style>
#yaq-version-tag{position:fixed;right:1rem;bottom:.75rem;z-index:9999;margin:0;padding:.35rem .7rem;border-radius:999px;background:rgba(7,16,24,.88);border:1px solid rgba(255,255,255,.14);color:#c5d4de;font:500 .8rem/1 "IBM Plex Sans",system-ui,sans-serif;letter-spacing:.04em;pointer-events:none}
</style>
<script>
(function(){
  var version=${versionLiteral};
  function sync(){
    var onAdmin=location.pathname==="/admin"||location.pathname==="/admin/";
    var el=document.getElementById("yaq-version-tag");
    if(!onAdmin){if(el)el.remove();return;}
    if(!el){
      el=document.createElement("p");
      el.id="yaq-version-tag";
      document.body.appendChild(el);
    }
    el.textContent="YAQ "+(window.__YAQ_VERSION__||version);
  }
  document.addEventListener("DOMContentLoaded",sync);
  window.addEventListener("popstate",sync);
  setInterval(sync,400);
})();
</script>`;
  if (html.includes("window.__YAQ_VERSION__=")) {
    return html.replace(
      /window\.__YAQ_VERSION__\s*=\s*(?:"[^"]*"|'[^']*')/,
      `window.__YAQ_VERSION__=${versionLiteral}`,
    );
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}</body>`);
  }
  return html + snippet;
}
