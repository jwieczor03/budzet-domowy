import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function localDatabase(path) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  sqlite.exec(
    readFileSync(
      new URL("../migrations/0001_budget.sql", import.meta.url),
      "utf8",
    ),
  );
  function prepare(sql, params = []) {
    const statement = sqlite.prepare(sql);
    return {
      bind: (...values) => prepare(sql, values),
      first: () => statement.get(...params) ?? null,
      run: () => ({ success: true, meta: statement.run(...params) }),
      all: () => ({ success: true, results: statement.all(...params) }),
      execute: () =>
        /RETURNING/i.test(sql)
          ? { success: true, results: statement.all(...params) }
          : { success: true, meta: statement.run(...params), results: [] },
    };
  }
  return {
    prepare,
    batch: (statements) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}
