import pg from "pg";

const { Pool } = pg;

const defaultLocalDatabaseUrl = "postgresql://happy:happy@localhost:5433/happy_tirana";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? defaultLocalDatabaseUrl,
  connectionTimeoutMillis: 5000
});

// A database restart invalidates idle connections; pg discards them and the
// next query reconnects. Handle the event without crashing or logging secrets.
pool.on("error", (error) => {
  console.error("PostgreSQL idle connection error:", error.message);
});

export async function closeDb() {
  await pool.end();
}
