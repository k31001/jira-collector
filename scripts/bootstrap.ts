import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const envLocal = path.join(root, ".env.local");
const dataDir = path.join(root, "data");

fs.mkdirSync(dataDir, { recursive: true });

let env = "";
if (fs.existsSync(envLocal)) {
  env = fs.readFileSync(envLocal, "utf8");
}

if (!/^APP_ENCRYPTION_KEY=/m.test(env)) {
  const key = randomBytes(32).toString("base64");
  env += (env.endsWith("\n") || env === "" ? "" : "\n") + `APP_ENCRYPTION_KEY=${key}\n`;
  console.log("[bootstrap] Generated APP_ENCRYPTION_KEY");
}

fs.writeFileSync(envLocal, env, "utf8");
console.log("[bootstrap] .env.local ready at", envLocal);
console.log("[bootstrap] data dir ready at", dataDir);
console.log("[bootstrap] Next:");
console.log("  1) npm run db:generate   # create migration SQL from schema");
console.log("  2) npm run db:migrate    # apply migrations to ./data/app.db");
console.log("  3) npm run dev");
