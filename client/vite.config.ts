import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const clientDir = dirname(fileURLToPath(import.meta.url));
const yaqVersion = (
  JSON.parse(readFileSync(resolve(clientDir, "../package.json"), "utf8")) as {
    version: string;
  }
).version;

export default defineConfig({
  plugins: [react()],
  define: {
    __YAQ_VERSION__: JSON.stringify(yaqVersion),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/ws": {
        target: "ws://127.0.0.1:3000",
        ws: true,
      },
    },
  },
});
