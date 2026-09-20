import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./server/api.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function localApi(): Plugin {
  return {
    name: "mc-local-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi({ rootDir }, req, res).then((hit) => {
          if (!hit) next();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      "@shared": path.join(rootDir, "shared"),
    },
  },
  server: {
    port: 5173,
  },
});
