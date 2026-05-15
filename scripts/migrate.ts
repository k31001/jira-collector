import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);
const migrationsFolder = path.join(process.cwd(), "drizzle");

if (!fs.existsSync(migrationsFolder)) {
  console.error(
    `[migrate] No migrations folder at ${migrationsFolder}. Run \`npm run db:generate\` first.`,
  );
  process.exit(1);
}

migrate(db, { migrationsFolder });
console.log("[migrate] migrations applied to", dbPath);
sqlite.close();
