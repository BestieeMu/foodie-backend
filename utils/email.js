const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// The sender email should be configured, default to a Resend test domain or the user's verified domain.
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Foodie Platform <onboarding@resend.dev>';

/**
 * Send welcome email to a new restaurant admin
 */
async function sendRestaurantWelcomeEmail(email, name, password) {
  try {
    if (!resend) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Resend configuration missing in production');
      }
      console.warn('--- EMAIL SKIPPED - RESEND NOT CONFIGURED ---');
      console.log(`To: ${email}`);
      console.log(`Subject: Welcome to Foodie Platform`);
      console.log(`Body: Hello ${name}, your restaurant account has been created. Use password: ${password}`);
      console.log('----------------------------------------');
      return;
    }

    const data = await resend.emails.send({
      from: fromEmail,
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

    if (data.error) {
      console.error('Resend API Error:', data.error);
    } else {
      console.log("Email sent successfully. ID:", data.data?.id);
    }
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

/**
 * Send OTP for verification
 */
async function sendOtpEmail(email, otp) {
  try {
    if (!resend) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Resend configuration missing in production');
      }
      console.warn('--- OTP EMAIL SKIPPED - RESEND NOT CONFIGURED ---');
      console.log(`To: ${email}`);
      console.log(`OTP: ${otp}`);
      console.log('--------------------------------------');
      return;
    }

    const data = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Verify Your Account - Foodie",
      text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Verify Your Account</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing: 5px; background: #eee; padding: 10px; display: inline-block;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });

    if (data.error) {
      console.error('Resend API Error:', data.error);
    } else {
      console.log("OTP Email sent successfully. ID:", data.data?.id);
    }
  } catch (error) {
    console.error('Failed to send OTP:', error);
  }
}

module.exports = {
  sendRestaurantWelcomeEmail,
  sendOtpEmail
};
