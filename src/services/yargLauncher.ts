import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getSettings } from "../db.js";

export function buildYaqBridgeUrl(hostPort?: number): string {
  const port = hostPort ?? getSettings().hostPort;
  return `ws://127.0.0.1:${port}/ws?role=yarg`;
}

export type YargLaunchResult = {
  pid: number;
  executable: string;
  url: string;
  args: string[];
  command: string;
};

let lastProcess: ChildProcess | null = null;

export function getLaunchedYargPid(): number | null {
  const pid = lastProcess?.pid;
  if (!pid) return null;
  try {
    // Signal 0 checks liveness without killing.
    process.kill(pid, 0);
    return pid;
  } catch {
    lastProcess = null;
    return null;
  }
}

export function launchYargProcess(executableOverride?: string): YargLaunchResult {
  const settings = getSettings();
  const executable = (executableOverride ?? settings.yargExecutable).trim();
  if (!executable) {
    throw new Error("Set the YARG executable path in admin settings first");
  }
  if (!fs.existsSync(executable)) {
    throw new Error(`YARG executable not found: ${executable}`);
  }

  const url = buildYaqBridgeUrl(settings.hostPort);
  const args = ["-event-mode", "-yaq-url", url];
  const child = spawn(executable, args, {
    cwd: path.dirname(executable),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  if (!child.pid) {
    throw new Error("Failed to start YARG process");
  }

  child.unref();
  lastProcess = child;

  const command = [executable, ...args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(" ");

  console.log(`Launched YARG pid=${child.pid}: ${command}`);
  return {
    pid: child.pid,
    executable,
    url,
    args,
    command,
  };
}
