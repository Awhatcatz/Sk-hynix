import { spawn } from "node:child_process";
import { once } from "node:events";
import readline from "node:readline";
import { createWriteStream } from "node:fs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = readline.createInterface({ input: process.stdin, terminal: false });
console.log("Ready for QA configuration on stdin");
const [line] = await once(lines, "line"); lines.close();
const input = JSON.parse(line);
const port = Number(input.RADAR_TEST_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid QA port");
const env = { ...process.env, ...input, RADAR_TEST_URL: input.RADAR_TEST_URL || `http://127.0.0.1:${port}` };
let preview;
async function run(script) {
  const child = spawn(process.execPath, ["--import", "tsx", script], { env, stdio: "inherit", windowsHide: true });
  const [code] = await once(child, "exit"); if (code) throw new Error(`${script} failed`);
}
try {
  if (!input.RADAR_TEST_URL) {
    const output = createWriteStream("outputs/preview.log");
    preview = spawn(process.execPath, ["scripts/run-framework.mjs", "dev", "--host", "127.0.0.1", "--port", String(port)], { env: { ...env, CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", DASHBOARD_ACCESS_KEY: input.RADAR_ACCESS_TOKEN, DASHBOARD_LINK_ONLY: input.RADAR_LINK_ONLY === "1" ? "true" : "false" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    preview.stdout.pipe(output); preview.stderr.pipe(output);
    let ready = false;
    for (let i = 0; i < 90; i++) { await new Promise((resolve) => setTimeout(resolve, 1000)); try { if ((await fetch(env.RADAR_TEST_URL)).ok) { ready = true; break; } } catch {} }
    if (!ready) throw new Error("Preview did not become ready");
    console.log("Preview ready at " + env.RADAR_TEST_URL);
  }
  await run("tests/api-security-smoke.ts");
  await run("tests/browser-smoke.ts");
} finally {
  if (preview) {
    const killer = spawn("taskkill", ["/PID", String(preview.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    await once(killer, "exit");
  }
}
