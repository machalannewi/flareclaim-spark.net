import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  // Get the domain from the request
  const host = req.headers.host;

  // Create a unique ID for each domain (hash the domain name to get a number)
  function getDomainId(domain) {
    // Simple hash function to convert domain to a number
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = (hash << 5) - hash + domain.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  const domainId = getDomainId(host);

  try {
    // Initialize table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS flareclaimspark (
        id INT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        state VARCHAR(3) NOT NULL CHECK (state IN ('ON', 'OFF'))
      )
    `;

    // Insert default state for this domain if it doesn't exist
    await sql`
      INSERT INTO flareclaimspark (id, domain, state) 
      VALUES (${domainId}, ${host}, 'OFF') 
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
        WHERE id = ${domainId}
      `;

      return res.status(200).json({ state, domain: host });
    } else {
      const result = await sql`
        SELECT state, domain FROM flareclaimspark WHERE id = ${domainId}
      `;

      return res.status(200).json({
        state: result[0]?.state || "OFF",
        domain: result[0]?.domain || host,
      });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Database error", message: error.message });
  }
}
