const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send welcome email to a new restaurant admin
 */
async function sendRestaurantWelcomeEmail(email, name, password) {
  try {
    // If SMTP is not configured, log to console and return
    if (!process.env.SMTP_HOST) {
      console.log('--- EMAIL MOCK (SMTP NOT CONFIGURED) ---');
      console.log(`To: ${email}`);
      console.log(`Subject: Welcome to Foodie Platform`);
      console.log(`Body: Hello ${name}, your restaurant account has been created. Use password: ${password}`);
      console.log('----------------------------------------');
      return;
    }

    const info = await transporter.sendMail({
      from: `"Foodie Platform" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Welcome to Foodie Platform - Your Restaurant Account",
      text: `Hello ${name},\n\nYour restaurant account has been created successfully.\n\nYou can log in to the Admin Dashboard using these credentials:\n\nEmail: ${email}\nPassword: ${password}\n\nPlease change your password after your first login.\n\nBest regards,\nFoodie Team`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Welcome to Foodie Platform!</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your restaurant account has been created successfully.</p>
          <p>You can log in to the <a href="${process.env.ADMIN_WEB_URL || 'http://localhost:5173'}">Admin Dashboard</a> using these credentials:</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
          </div>
          <p>Please change your password after your first login.</p>
          <br/>
          <p>Best regards,<br/>Foodie Team</p>
        </div>
      `,
    });

    console.log("Email sent: %s", info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

module.exports = {
  sendRestaurantWelcomeEmail,
};
