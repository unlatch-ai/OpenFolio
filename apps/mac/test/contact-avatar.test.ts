import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactAvatar } from "../src/renderer/components/ContactAvatar";

describe("ContactAvatar", () => {
  it("renders synced contact thumbnails when available", () => {
    const markup = renderToStaticMarkup(createElement(ContactAvatar, {
      name: "Ada Lovelace",
      avatarDataUrl: "data:image/jpeg;base64,abc123",
      size: 32,
    }));

    expect(markup).toContain("<img");
    expect(markup).toContain("data:image/jpeg;base64,abc123");
  });

  it("falls back to initials without a thumbnail", () => {
    const markup = renderToStaticMarkup(createElement(ContactAvatar, {
      name: "Ada Lovelace",
      size: 32,
    }));

    expect(markup).toContain(">AL<");
  });
});
