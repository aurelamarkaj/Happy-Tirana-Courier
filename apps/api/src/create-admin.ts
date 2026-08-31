import "dotenv/config";
import crypto from "node:crypto";
import { closeDb, pool } from "@happy-tirana/db";

function hashPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");
  return `${salt}:${hash}`;
}

const name = process.env.ADMIN_NAME?.trim() || "Local Superadmin";
const email = process.env.ADMIN_EMAIL?.trim();
const phone = process.env.ADMIN_PHONE?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!email || !phone || !password || password.includes("replace-with")) {
  throw new Error(
    "Set ADMIN_EMAIL, ADMIN_PHONE, and ADMIN_PASSWORD in your local .env before running db:create-admin.",
  );
}

await pool.query(
  `INSERT INTO users (name, email, phone, password_hash, role, status)
   VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE')
   ON CONFLICT (email) DO UPDATE SET
     name = EXCLUDED.name,
     phone = EXCLUDED.phone,
     password_hash = EXCLUDED.password_hash,
     role = 'ADMIN',
     status = 'ACTIVE',
     updated_at = now()`,
  [name, email, phone, hashPassword(password)],
);

await closeDb();

console.log(`Superadmin ready: ${email}`);
