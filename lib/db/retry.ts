// Railway's proxy closes idle Postgres connections. If a query hits one of
// those, run it once more on a fresh connection.

export function isConnectionClosedError(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return (
    code === "P1017" ||
    /closed the connection|connection terminated/i.test(String(message ?? ""))
  );
}

export async function withConnectionRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isConnectionClosedError(error)) throw error;
    return operation();
  }
}
