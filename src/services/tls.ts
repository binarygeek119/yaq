import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../paths.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type TlsFiles = { key: Buffer; cert: Buffer };

export function tlsDir(root = dataRoot()): string {
  return path.join(root, "tls");
}

export function subjectAltNames(hosts: string[]): string[] {
  const names = new Set(["DNS:localhost", "IP:127.0.0.1"]);
  for (const host of hosts) {
    const trimmed = host.trim();
    if (!trimmed) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) names.add(`IP:${trimmed}`);
    else names.add(`DNS:${trimmed}`);
  }
  return [...names];
}

export function certCoversHosts(pem: string, hosts: string[]): boolean {
  try {
    const cert = new X509Certificate(pem);
    if (Date.parse(cert.validTo) < Date.now() + WEEK_MS) return false;
    const alt = cert.subjectAltName ?? "";
    return subjectAltNames(hosts).every((item) => {
      if (item.startsWith("IP:")) {
        const ip = item.slice(3);
        return alt.includes(`IP Address:${ip}`) || alt.includes(`IP:${ip}`);
      }
      return alt.includes(item);
    });
  } catch {
    return false;
  }
}

export function ensureSelfSignedTls(
  hosts: string[],
  dir = tlsDir(),
): TlsFiles | null {
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const cert = fs.readFileSync(certPath);
    if (certCoversHosts(cert.toString("utf8"), hosts)) {
      return { key: fs.readFileSync(keyPath), cert };
    }
  }
  const sans = subjectAltNames(hosts);
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "365",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-subj",
        "/CN=YAQ",
        "-addext",
        `subjectAltName=${sans.join(",")}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } catch (err) {
    console.error(
      "YAQ HTTPS disabled: could not create a TLS certificate with openssl",
      err,
    );
    return null;
  }
}
