import { afterEach, describe, expect, it } from "vitest";

import { buildCallbackUrl } from "./oauth";

const CALLBACK = "/api/integrations/quickbooks/callback";

function requestWith(headers: Record<string, string>) {
  return new Request("https://internal.example/api/integrations/quickbooks/connect", { headers });
}

afterEach(() => {
  delete process.env.QUICKBOOKS_REDIRECT_URI;
});

describe("buildCallbackUrl", () => {
  it("derives the URL from the request host by default", () => {
    expect(buildCallbackUrl(requestWith({ host: "flow.primekw.net", "x-forwarded-proto": "https" }))).toBe(`https://flow.primekw.net${CALLBACK}`);
    expect(buildCallbackUrl(requestWith({ host: "localhost:3000" }))).toBe(`http://localhost:3000${CALLBACK}`);
  });

  it("uses the configured redirect URI when set, whatever host the request carries", () => {
    process.env.QUICKBOOKS_REDIRECT_URI = ` https://flow.primekw.net${CALLBACK} `;
    expect(buildCallbackUrl(requestWith({ host: "primeflowboard.netlify.app" }))).toBe(`https://flow.primekw.net${CALLBACK}`);
  });
});
