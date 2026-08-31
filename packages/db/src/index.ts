import pg from "pg";

const { Pool } = pg;

const defaultLocalDatabaseUrl = "postgresql://happy:happy@localhost:5433/happy_tirana";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? defaultLocalDatabaseUrl
});

export async function closeDb() {
  await pool.end();
}
