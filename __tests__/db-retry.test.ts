import { describe, expect, it, vi } from "vitest";
import { isConnectionClosedError, withConnectionRetry } from "../lib/db/retry";

describe("db connection retry", () => {
  it("recognises closed-connection errors only", () => {
    expect(isConnectionClosedError({ code: "P1017" })).toBe(true);
    expect(isConnectionClosedError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isConnectionClosedError({ code: "P2002", message: "Unique" })).toBe(false);
    expect(isConnectionClosedError(null)).toBe(false);
  });

  it("retries once after a closed connection", async () => {
    const op = vi.fn().mockRejectedValueOnce({ code: "P1017" }).mockResolvedValueOnce("ok");
    await expect(withConnectionRetry(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const err = { code: "P2002" };
    const op = vi.fn().mockRejectedValue(err);
    await expect(withConnectionRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
