import { describe, expect, it } from "vitest";
import {
  PICTURE_PAYLOAD_TOO_LARGE,
  bodyTooLargeMessage,
  isBodyTooLargeError,
} from "./httpErrors.js";

describe("bodyTooLargeMessage", () => {
  it("names a profile upload as a picture payload", () => {
    expect(bodyTooLargeMessage("/api/profile")).toBe(PICTURE_PAYLOAD_TOO_LARGE);
    expect(bodyTooLargeMessage("/api/profile/photo")).toBe(
      PICTURE_PAYLOAD_TOO_LARGE,
    );
  });

  it("keeps a generic message for other routes", () => {
    expect(bodyTooLargeMessage("/api/admin/settings")).toBe(
      "Request is too large",
    );
  });
});

describe("isBodyTooLargeError", () => {
  it("detects Fastify body-limit errors", () => {
    expect(isBodyTooLargeError({ code: "FST_ERR_CTP_BODY_TOO_LARGE" })).toBe(
      true,
    );
    expect(isBodyTooLargeError({ statusCode: 413 })).toBe(true);
    expect(isBodyTooLargeError({ statusCode: 400 })).toBe(false);
  });
});
