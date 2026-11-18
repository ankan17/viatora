#!/usr/bin/env node
// Runs the visual tests (`pnpm test:visual`) with the browser inside Playwright's
// Linux image, so screenshots come out the same on a Mac and on CI. Extra
// arguments go to `playwright test`, e.g. `pnpm test:visual --update-snapshots`.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("@playwright/test/package.json");
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const port = Number(process.env.VISUAL_BROWSER_PORT ?? 3200);
const name = `viatora-visual-${process.pid}`;

const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const stop = () => docker("rm", "-f", name);

if (docker("version", "--format", "{{.Server.Version}}").status !== 0) {
  console.error("The visual tests need Docker running (the same one `pnpm db:start` uses).");
  process.exit(1);
}

const started = docker(
  "run",
  "--detach",
  "--rm",
  "--init",
  "--ipc=host",
  "--name",
  name,
  "--publish",
  `127.0.0.1:${port}:${port}`,
  "--workdir",
  "/home/pwuser",
  "--user",
  "pwuser",
  image,
  "npx",
  "-y",
  `playwright@${version}`,
  "run-server",
  "--port",
  String(port),
  "--host",
  "0.0.0.0",
);
if (started.status !== 0) {
  console.error(started.stderr);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

async function waitForBrowserServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      if (docker("inspect", name).status !== 0) throw new Error("The browser container exited before it was ready.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`The browser container didn't start listening on port ${port}.\n${docker("logs", name).stderr}`);
}

let code = 1;
try {
  await waitForBrowserServer();
  const run = spawn("pnpm", ["exec", "playwright", "test", "-c", "playwright.visual.config.ts", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, VISUAL_BROWSER_WS: `ws://127.0.0.1:${port}/` },
  });
  code = await new Promise((resolve) => run.on("close", (c) => resolve(c ?? 1)));
} catch (err) {
  console.error(err.message);
} finally {
  stop();
}
process.exit(code);
