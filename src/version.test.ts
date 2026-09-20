import { describe, expect, it } from "vitest";
import { YAQ_VERSION, injectYaqVersionHtml } from "./version.js";

describe("injectYaqVersionHtml", () => {
  it("stamps the package version into the SPA shell", () => {
    const html = injectYaqVersionHtml(
      "<html><body><div id=\"root\"></div></body></html>",
    );
    expect(html).toContain(`window.__YAQ_VERSION__=${JSON.stringify(YAQ_VERSION)}`);
    expect(html).toContain("yaq-version-tag");
    expect(YAQ_VERSION).toBe("1.0.0");
  });
});
