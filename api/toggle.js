import { createClient } from "@vercel/postgres";

export default async function handler(req, res) {
  const client = createClient();
  await client.connect();

  try {
    // Initialize table if not exists
    await client.sql`
      CREATE TABLE IF NOT EXISTS flareclaimspark (
        id INT PRIMARY KEY,
        state VARCHAR(3) NOT NULL CHECK (state IN ('ON', 'OFF'))
      )
    `;

    await client.sql`
      INSERT INTO flareclaimspark (id, state) 
      VALUES (1, 'OFF') 
      ON CONFLICT (id) DO NOTHING
    `;

    if (req.method === "POST") {
      const { state } = req.body;
      if (state !== "ON" && state !== "OFF") {
        return res.status(400).json({ error: "Invalid state" });
      }

      await client.sql`
        UPDATE flareclaimspark 
        SET state = ${state} 
        WHERE id = 1
      `;

      return res.status(200).json({ state });
    } else {
      const result = await client.sql`
        SELECT state FROM flareclaimspark WHERE id = 1
      `;

      return res.status(200).json({ state: result.rows[0]?.state || "OFF" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Database error" });
  } finally {
    await client.end();
  }
}
