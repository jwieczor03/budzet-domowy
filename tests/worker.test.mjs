import test from "node:test";
import assert from "node:assert/strict";
import worker, { verifyAccessToken } from "../server/worker.mjs";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { localDatabase } from "../scripts/local-db.mjs";
import {
  currentPeriod,
  today,
  emptyState,
  exportBackup,
} from "../server/domain.mjs";

const url = "http://127.0.0.1:8787";
function setup() {
  const DB = localDatabase(":memory:");
  return { DB, LOCAL_DEVELOPMENT: "loopback-only" };
}
function post(body, headers = {}) {
  return new Request(`${url}/api/actions`, {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5173",
      "Content-Type": "application/json",
      "X-Budget-Request": "1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const action = {
  type: "saveExpense",
  recurring: false,
  scope: "one",
  row: {
    id: "food",
    period: currentPeriod(),
    name: "Jedzenie",
    amount: 40000,
    source: "personal",
    category: "jedzenie",
    kind: "expense",
    note: "",
    household: true,
  },
};

test("brak konfiguracji, fałszywe nagłówki i dev flag na publicznej domenie nie dają dostępu", async () => {
  const env = setup();
  for (const request of [
    new Request("https://budget.workers.dev/api/state"),
    new Request("https://budget.workers.dev/api/state", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "owner@example.com",
        "Cf-Access-Jwt-Assertion": "forged",
      },
    }),
  ]) {
    assert.equal((await worker.fetch(request, env)).status, 401);
  }
  assert.equal(
    (
      await worker.fetch(
        new Request("https://budget.workers.dev/icon.svg"),
        env,
      )
    ).status,
    401,
  );
  env.DB.close();
});
test("brak Origin, obce Origin i brak własnego nagłówka blokują zapis", async () => {
  const env = setup();
  const payload = { revision: 0, operationId: crypto.randomUUID(), action };
  for (const headers of [
    { Origin: "https://evil.example" },
    { Origin: "" },
    { "X-Budget-Request": "" },
  ])
    assert.equal((await worker.fetch(post(payload, headers), env)).status, 403);
  env.DB.close();
});
test("ponowne wysłanie tej samej operacji nie tworzy drugiego wydatku", async () => {
  const env = setup();
  const body = { revision: 0, operationId: crypto.randomUUID(), action };
  const first = await worker.fetch(post(body), env);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);
  const repeated = await worker.fetch(post(body), env);
  assert.equal(repeated.status, 200);
  const s = await repeated.json();
  assert.equal(s.state.expenses.length, 1);
  assert.equal(s.revision, 1);
  const otherPayload = {
    ...body,
    action: { ...action, row: { ...action.row, amount: 50000 } },
  };
  assert.equal((await worker.fetch(post(otherPayload), env)).status, 409);
  env.DB.close();
});
test("stary widok nie nadpisuje nowszego zapisu", async () => {
  const env = setup();
  assert.equal(
    (
      await worker.fetch(
        post({ revision: 0, operationId: crypto.randomUUID(), action }),
        env,
      )
    ).status,
    200,
  );
  const stale = await worker.fetch(
    post({
      revision: 0,
      operationId: crypto.randomUUID(),
      action: { ...action, row: { ...action.row, id: "other" } },
    }),
    env,
  );
  assert.equal(stale.status, 409);
  const snapshot = await (
    await worker.fetch(new Request(`${url}/api/state`), env)
  ).json();
  assert.equal(snapshot.state.expenses.length, 1);
  env.DB.close();
});
test("równoległe różne dane z tym samym kluczem nie mieszają fragmentów bazy", async () => {
  const env = setup();
  const base = env.DB;
  let readers = 0;
  const waiting = [];
  env.DB = {
    ...base,
    prepare(sql) {
      const statement = base.prepare(sql);
      if (sql !== "SELECT action_hash FROM operations WHERE id = ?")
        return statement;
      return {
        ...statement,
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            ...bound,
            first() {
              if (readers >= 2) return bound.first();
              readers++;
              const result = bound.first();
              return new Promise((resolve) => {
                waiting.push(() => resolve(result));
                if (readers === 2) waiting.forEach((release) => release());
              });
            },
          };
        },
      };
    },
  };
  const operationId = crypto.randomUUID();
  const state = emptyState();
  for (let i = 0; i < 500; i++)
    state.expenses.push({
      ...action.row,
      id: `large-${i}`,
      note: "x".repeat(500),
    });
  const responses = await Promise.all([
    worker.fetch(
      post({
        revision: 0,
        operationId,
        action: { type: "settings", reserveTarget: 2000000 },
      }),
      env,
    ),
    worker.fetch(
      post({
        revision: 0,
        operationId,
        action: { type: "restore", backup: exportBackup(state) },
      }),
      env,
    ),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const response = await worker.fetch(new Request(`${url}/api/state`), env);
  assert.equal(response.status, 200);
  const stored = await response.json();
  assert.equal(stored.revision, 1);
  assert.ok(
    stored.state.expenses.length === 0 || stored.state.expenses.length === 500,
  );
  base.close();
});
test("równoległe zapisy wykonują atomowy compare-and-swap", async () => {
  const env = setup();
  const responses = await Promise.all([
    worker.fetch(
      post({ revision: 0, operationId: crypto.randomUUID(), action }),
      env,
    ),
    worker.fetch(
      post({
        revision: 0,
        operationId: crypto.randomUUID(),
        action: { ...action, row: { ...action.row, id: "other" } },
      }),
      env,
    ),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const result = await (
    await worker.fetch(new Request(`${url}/api/state`), env)
  ).json();
  assert.equal(result.state.expenses.length, 1);
  env.DB.close();
});
test("JSON importu i schema walidowane po stronie API", async () => {
  const env = setup();
  const response = await worker.fetch(
    post({
      revision: 0,
      operationId: crypto.randomUUID(),
      action: { ...action, row: { ...action.row, amount: -40000 } },
    }),
    env,
  );
  assert.equal(response.status, 422);
  const oversized = new Request(`${url}/api/actions`, {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5173",
      "X-Budget-Request": "1",
      "Content-Type": "application/json",
      "Content-Length": "5000000",
    },
    body: "{}",
  });
  assert.equal((await worker.fetch(oversized, env)).status, 422);
  env.DB.close();
});
test("eksport zawiera wersjonowany pełny stan oraz nagłówki no-store/CSP", async () => {
  const env = setup();
  const response = await worker.fetch(new Request(`${url}/api/backup`), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(
    response.headers.get("Content-Security-Policy"),
    /frame-ancestors 'none'/,
  );
  const backup = await response.json();
  assert.equal(backup.format, "budzet-backup");
  assert.equal(backup.version, 1);
  assert.equal(backup.state.version, 1);
  env.DB.close();
});
test("weryfikacja podpisu, konta, audience, issuer i ważności JWT Access", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const { privateKey: wrongKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({
    keys: [{ ...jwk, kid: "test", alg: "RS256" }],
  });
  const env = {
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "budget",
    OWNER_EMAIL: "owner@example.com",
  };
  const token = (extra = {}, key = privateKey) =>
    new SignJWT({ email: "owner@example.com", ...extra })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("user")
      .setIssuer("https://test.cloudflareaccess.com")
      .setAudience("budget")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
  assert.equal(
    (await verifyAccessToken(await token(), jwks, env)).email,
    "owner@example.com",
  );
  assert.equal(
    await verifyAccessToken(
      await token({ email: "other@example.com" }),
      jwks,
      env,
    ),
    null,
  );
  assert.equal(
    await verifyAccessToken(await token(), jwks, {
      ...env,
      ACCESS_AUD: "other",
    }),
    null,
  );
  assert.equal(
    await verifyAccessToken(await token(), jwks, {
      ...env,
      ACCESS_TEAM_DOMAIN: "other.cloudflareaccess.com",
    }),
    null,
  );
  assert.equal(
    await verifyAccessToken(await token({}, wrongKey), jwks, env),
    null,
  );
  const expired = await new SignJWT({ email: env.OWNER_EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("user")
    .setIssuer("https://test.cloudflareaccess.com")
    .setAudience("budget")
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(privateKey);
  assert.equal(await verifyAccessToken(expired, jwks, env), null);
});
test("duża kopia mieści się w imporcie i odtwarza dokładnie tekst Unicode", async () => {
  const env = setup();
  const state = emptyState();
  for (let i = 0; i < 2800; i++)
    state.expenses.push({
      ...action.row,
      id: `row-${i}`,
      note: "Zażółć 🧾 ".repeat(60),
    });
  const backup = exportBackup(state);
  const saved = await worker.fetch(
    post({
      revision: 0,
      operationId: crypto.randomUUID(),
      action: { type: "restore", backup },
    }),
    env,
  );
  assert.equal(saved.status, 200, await saved.clone().text());
  const response = await worker.fetch(new Request(`${url}/api/backup`), env);
  const text = await response.text();
  assert.ok(new TextEncoder().encode(text).byteLength < 4 * 1024 * 1024);
  const exported = JSON.parse(text);
  assert.equal(exported.state.expenses.length, 2800);
  assert.equal(exported.state.expenses[2799].note, state.expenses[2799].note);
  assert.ok(
    env.DB.prepare("SELECT COUNT(*) AS count FROM budget_chunks").first()
      .count > 1,
  );
  const restored = await worker.fetch(
    post({
      revision: 1,
      operationId: crypto.randomUUID(),
      action: { type: "restore", backup: exported },
    }),
    env,
  );
  assert.equal(restored.status, 200, await restored.clone().text());
  env.DB.close();
});
