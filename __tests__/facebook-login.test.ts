import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMissingInstagramOAuthEnv, isFacebookLoginMode } from "../lib/env";
import { exchangeCodeForToken, getAuthorizationUrl } from "../lib/meta/oauth";
import {
  getFacebookLoginConnection,
  getUserInfo,
  getUserMedia,
  sendPrivateReply,
} from "../lib/meta/client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
  vi.stubEnv("FACEBOOK_APP_ID", "fb-app-id");
  vi.stubEnv("FACEBOOK_APP_SECRET", "fb-secret");
  vi.stubEnv("FACEBOOK_LOGIN_CONFIG_ID", "config-123");
  vi.stubEnv("INSTAGRAM_APP_ID", "");
  vi.stubEnv("INSTAGRAM_APP_SECRET", "");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Facebook Login mode", () => {
  it("is selected by FACEBOOK_LOGIN_CONFIG_ID", () => {
    expect(isFacebookLoginMode()).toBe(true);
    vi.stubEnv("FACEBOOK_LOGIN_CONFIG_ID", "");
    expect(isFacebookLoginMode()).toBe(false);
  });

  it("requires the Facebook env, not the Instagram pair", () => {
    expect(getMissingInstagramOAuthEnv()).toEqual([]);
    vi.stubEnv("FACEBOOK_APP_ID", "");
    expect(getMissingInstagramOAuthEnv()).toEqual(["FACEBOOK_APP_ID"]);
  });

  it("builds a Facebook dialog URL with the login configuration", () => {
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "st"));
    expect(url.origin + url.pathname).toBe(
      "https://www.facebook.com/v25.0/dialog/oauth"
    );
    expect(url.searchParams.get("client_id")).toBe("fb-app-id");
    expect(url.searchParams.get("config_id")).toBe("config-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("scope")).toBeNull();
  });

  it("exchanges the code on graph.facebook.com", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ access_token: "user-tok" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForToken("the-code", "https://app.test/cb");

    expect(result.accessToken).toBe("user-tok");
    const called = new URL(fetchMock.mock.calls[0][0]);
    expect(called.host).toBe("graph.facebook.com");
    expect(called.searchParams.get("client_secret")).toBe("fb-secret");
    expect(called.searchParams.get("code")).toBe("the-code");
  });

  it("picks the Page with a linked Instagram account and keeps its token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "long-user-tok" }))
      .mockResolvedValueOnce(
        json({
          data: [
            { id: "p1", name: "No IG", access_token: "p1-tok" },
            {
              id: "p2",
              name: "Shop",
              access_token: "p2-tok",
              instagram_business_account: { id: "1784", username: "shop" },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const conn = await getFacebookLoginConnection("user-tok");

    expect(conn.pageId).toBe("p2");
    expect(conn.pageAccessToken).toBe("p2-tok");
    expect(conn.instagram).toMatchObject({ id: "1784", user_id: "1784", username: "shop" });
    const accounts = new URL(fetchMock.mock.calls[1][0]);
    expect(accounts.pathname).toBe("/v25.0/me/accounts");
    expect(accounts.searchParams.get("access_token")).toBe("long-user-tok");
  });

  it("fails clearly when no granted Page has an Instagram account", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ access_token: "long" }))
        .mockResolvedValueOnce(json({ data: [{ id: "p1", name: "x", access_token: "t" }] }))
    );
    await expect(getFacebookLoginConnection("user-tok")).rejects.toThrow(
      /linked Instagram professional account/
    );
  });

  it("reads the Instagram account off the Page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ instagram_business_account: { id: "1784", username: "shop" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const info = await getUserInfo("page-tok");

    expect(info).toMatchObject({ id: "1784", user_id: "1784", username: "shop" });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.host).toBe("graph.facebook.com");
    expect(url.pathname).toBe("/v25.0/me");
  });

  it("reads media off the Instagram account id, not me", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ instagram_business_account: { id: "1999", username: "a" } }))
      .mockResolvedValueOnce(json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getUserMedia("page-tok-media", 5);

    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.host).toBe("graph.facebook.com");
    expect(url.pathname).toBe("/v25.0/1999/media");
  });

  it("sends private replies through the Page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ recipient_id: "r", message_id: "m" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendPrivateReply("page-tok", "1784", "comment-1", "hi");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://graph.facebook.com/v25.0/me/messages"
    );
  });
});
