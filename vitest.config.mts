import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      // Needs the local Supabase stack: `pnpm db:start`.
      { resolve: { alias }, test: { name: "db", include: ["tests/db/**/*.test.ts"], environment: "node", testTimeout: 20_000 } },
    ],
  },
});
