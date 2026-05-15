import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_FILE
  ? process.env.DATABASE_FILE
  : path.join(process.cwd(), "data", "app.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqliteGlobal = globalThis as unknown as {
  __sqlite?: Database.Database;
  __drizzleMigrated?: boolean;
};

const sqlite = sqliteGlobal.__sqlite ?? new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqliteGlobal.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });

if (!sqliteGlobal.__drizzleMigrated) {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (fs.existsSync(migrationsFolder)) {
    try {
      migrate(db, { migrationsFolder });
    } catch (err) {
      console.error("[db] migration failed:", err);
    }
  }
  sqliteGlobal.__drizzleMigrated = true;
}

export { schema };
