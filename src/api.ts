import type { Snapshot } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function request(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (
      response.redirected ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new ApiError(
        "Sesja wygasła. Zaloguj się ponownie, a następnie odśwież dane.",
        401,
      );
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(
        result.error || "Nie udało się wykonać operacji.",
        response.status,
      );
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Brak potwierdzenia z serwera. Sprawdź połączenie i odśwież dane przed ponowną próbą. Wpisane pola pozostają w formularzu.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
export function getSnapshot(): Promise<Snapshot> {
  return request("/api/state");
}
export function sendAction(
  revision: number,
  operationId: string,
  action: object,
): Promise<Snapshot> {
  return request("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Budget-Request": "1" },
    body: JSON.stringify({ revision, operationId, action }),
  });
}
export async function downloadBackup() {
  const backup = await request("/api/backup");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `budzet-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
