import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    // Initialize table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS flareclaimspark (
        id INT PRIMARY KEY,
        state VARCHAR(3) NOT NULL CHECK (state IN ('ON', 'OFF'))
      )
    `;

    await sql`
      INSERT INTO flareclaimspark (id, state) 
      VALUES (1, 'OFF') 
      ON CONFLICT (id) DO NOTHING
    `;

    if (req.method === "POST") {
      const { state } = req.body;
      if (state !== "ON" && state !== "OFF") {
        return res.status(400).json({ error: "Invalid state" });
      }

      await sql`
        UPDATE flareclaimspark 
        SET state = ${state} 
        WHERE id = 1
      `;

      return res.status(200).json({ state });
    } else {
      const result = await sql`
        SELECT state FROM flareclaimspark WHERE id = 1
      `;

      return res.status(200).json({ state: result[0]?.state || "OFF" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Database error" });
  }
}
