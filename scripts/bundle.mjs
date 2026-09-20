import fs from "node:fs";
import * as esbuild from "esbuild";

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

await esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/yaq.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  // Native addon must stay external and ship via pkg assets / node_modules.
  external: ["better-sqlite3"],
  // Make import.meta.url resolve to this bundle when emitting CJS for pkg.
  banner: {
    js: 'const import_meta_url = require("url").pathToFileURL(__filename).href;',
  },
  define: {
    "import.meta.url": "import_meta_url",
    "process.env.YAQ_VERSION": JSON.stringify(version),
  },
  logLevel: "info",
});
