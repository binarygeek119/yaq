import { describe, expect, it } from "vitest";
import { blobToBase64, encodeWav } from "./wav.ts";

describe("encodeWav", () => {
  it("writes a PCM WAV header for the samples", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const blob = encodeWav(samples, 22050);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(bytes.length).toBe(44 + samples.length * 2);
    const b64 = await blobToBase64(blob);
    expect(b64.length).toBeGreaterThan(40);
    expect(atob(b64).startsWith("RIFF")).toBe(true);
  });
});
