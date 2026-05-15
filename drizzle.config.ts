import type { Config } from "drizzle-kit";
import path from "node:path";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${path.join(process.cwd(), "data", "app.db")}`,
  },
} satisfies Config;
