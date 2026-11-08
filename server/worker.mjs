import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  applyAction,
  emptyState,
  DomainError,
  exportBackup,
} from "./domain.mjs";

const keys = new Map();
const MAX_BODY = 4 * 1024 * 1024;
const envelope = z
  .object({
    revision: z.number().int().min(0),
    operationId: z.string().uuid(),
    action: z.unknown(),
  })
  .strict();

export function secured(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'",
  );
  return new Response(response.body, { status: response.status, headers });
}
function json(data, status = 200) {
  return secured(Response.json(data, { status }));
}
function isLocal(request, env) {
  // Dev-only adapter injects this flag. It is never part of wrangler.jsonc.
  return (
    env.LOCAL_DEVELOPMENT === "loopback-only" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export async function authorize(request, env) {
  if (isLocal(request, env)) return { email: "lokalny-podglad", local: true };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.OWNER_EMAIL)
    return null;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!keys.has(issuer))
    keys.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
    );
  return verifyAccessToken(token, keys.get(issuer), env);
}
export async function verifyAccessToken(token, jwks, env) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
    )
      return null;
    return { email: payload.email, local: false };
  } catch {
    return null;
  }
}
async function bodyJSON(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("Wyślij dane w formacie JSON.");
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY)
    throw new DomainError("Plik jest za duży. Maksymalny rozmiar to 4 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Brak danych.");
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) {
      await reader.cancel();
      throw new DomainError("Plik jest za duży. Maksymalny rozmiar to 4 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DomainError("Nieprawidłowy plik JSON.");
  }
}
async function load(db) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO budget (id, revision, document, last_operation) VALUES (1, 0, ?, NULL)",
    )
    .bind(JSON.stringify(emptyState()))
    .run();
  // One query gives a consistent snapshot even if another device commits concurrently.
  const result = await db
    .prepare(
      "SELECT b.revision, b.document, c.content FROM budget b LEFT JOIN budget_chunks c ON c.revision = b.revision WHERE b.id = 1 ORDER BY c.part",
    )
    .all();
  const row = result.results[0];
  return {
    revision: row.revision,
    state: JSON.parse(
      row.document || result.results.map((r) => r.content).join(""),
    ),
  };
}
function chunks(document) {
  const result = [];
  for (let start = 0; start < document.length;) {
    let end = Math.min(start + 100000, document.length);
    const code = document.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end--;
    result.push(document.slice(start, end));
    start = end;
  }
  return result;
}
async function digest(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export default {
  async fetch(request, env) {
    try {
      const identity = await authorize(request, env);
      if (!identity)
        return json(
          {
            error:
              "Dostęp tylko dla właściciela. Zaloguj się ponownie lub sprawdź konfigurację dostępu.",
            code: "UNAUTHORIZED",
          },
          401,
        );
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) {
        if (!env.ASSETS) return json({ error: "Nie znaleziono strony." }, 404);
        return secured(await env.ASSETS.fetch(request));
      }
      if (!env.DB)
        return json(
          { error: "Baza danych nie jest jeszcze skonfigurowana." },
          503,
        );
      if (
        request.method === "GET" &&
        (url.pathname === "/api/state" || url.pathname === "/api/backup")
      ) {
        const result = await load(env.DB);
        if (url.pathname === "/api/backup") {
          return secured(
            new Response(JSON.stringify(exportBackup(result.state)), {
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="budzet-${new Date().toISOString().slice(0, 10)}.json"`,
              },
            }),
          );
        }
        return json({ ...result, local: identity.local });
      }
      if (request.method !== "POST" || url.pathname !== "/api/actions")
        return json({ error: "Nie znaleziono operacji." }, 404);
      // Reject cross-site writes and form posts. No CORS response is emitted.
      const expectedOrigin = isLocal(request, env)
        ? "http://127.0.0.1:5173"
        : url.origin;
      if (
        request.headers.get("Origin") !== expectedOrigin ||
        request.headers.get("X-Budget-Request") !== "1"
      )
        return json({ error: "Nieprawidłowe pochodzenie żądania." }, 403);
      const input = envelope.parse(await bodyJSON(request));
      const hash = await digest(input.action);
      const receipt = await env.DB.prepare(
        "SELECT action_hash FROM operations WHERE id = ?",
      )
        .bind(input.operationId)
        .first();
      if (receipt) {
        if (receipt.action_hash !== hash)
          return json(
            { error: "Klucz operacji został już użyty dla innych danych." },
            409,
          );
        return json({ ...(await load(env.DB)), local: identity.local });
      }
      const before = await load(env.DB);
      if (before.revision !== input.revision)
        return json(
          {
            error:
              "Dane zmieniły się na innym urządzeniu. Odśwież dane i sprawdź formularz przed ponownym zapisem.",
            code: "CONFLICT",
          },
          409,
        );
      const state = applyAction(before.state, input.action, input.operationId);
      const document = JSON.stringify(state);
      if (new TextEncoder().encode(document).byteLength > MAX_BODY - 10000)
        return json(
          {
            error:
              "Baza zbliżyła się do limitu rozmiaru tej wersji aplikacji. Pobierz kopię i skontaktuj się z opiekunem aplikacji.",
          },
          413,
        );
      const nextRevision = before.revision + 1;
      // An attempt nonce is distinct from the retry/idempotency key. A losing
      // request must never match the winner's chunk guards, even with the same key.
      const attemptId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare(
          "UPDATE budget SET document = '', revision = ?, last_operation = ? WHERE id = 1 AND revision = ? RETURNING revision",
        ).bind(nextRevision, attemptId, before.revision),
        env.DB.prepare(
          "DELETE FROM budget_chunks WHERE revision != ? AND EXISTS (SELECT 1 FROM budget WHERE id = 1 AND revision = ? AND last_operation = ?)",
        ).bind(nextRevision, nextRevision, attemptId),
        ...chunks(document).map((chunk, index) =>
          env.DB.prepare(
            "INSERT OR IGNORE INTO budget_chunks (revision, part, content) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM budget WHERE id = 1 AND revision = ? AND last_operation = ?)",
          ).bind(nextRevision, index, chunk, nextRevision, attemptId),
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO operations (id, action_hash, revision) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM budget WHERE id = 1 AND revision = ? AND last_operation = ?)",
        ).bind(input.operationId, hash, nextRevision, nextRevision, attemptId),
      ]);
      if (!results[0].results?.length) {
        const repeated = await env.DB.prepare(
          "SELECT action_hash FROM operations WHERE id = ?",
        )
          .bind(input.operationId)
          .first();
        if (repeated?.action_hash === hash)
          return json({ ...(await load(env.DB)), local: identity.local });
        return json(
          {
            error:
              "Inny zapis nastąpił wcześniej. Odśwież dane przed ponowną próbą.",
            code: "CONFLICT",
          },
          409,
        );
      }
      return json({ revision: nextRevision, state, local: identity.local });
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(
          {
            error: "Sprawdź poprawność kwot, dat i wymaganych pól.",
            details: error.issues
              .slice(0, 5)
              .map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          422,
        );
      if (error instanceof DomainError)
        return json({ error: error.message }, 422);
      // Do not log request bodies, records, identity or raw database errors.
      return json(
        {
          error:
            "Nie udało się zapisać lub odczytać danych. Odśwież widok, aby sprawdzić wynik. Formularz pozostaje otwarty.",
          code: "SERVER_ERROR",
        },
        500,
      );
    }
  },
};
