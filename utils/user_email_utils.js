const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Very simple HTML email template (no styling, no images)
 */
function generateEmailTemplate({
  title,
  message,
  otpCode = null,
  extra = null,
}) {
  return `
<!DOCTYPE html>
<html>
  <body>
    <h2>${title}</h2>

    <p>${message}</p>

    ${
      otpCode
        ? `
          <p><strong>Your verification code:</strong></p>
          <p style="font-size:18px;"><strong>${otpCode}</strong></p>
          <p>This code expires in 15 minutes.</p>
        `
        : ""
    }

    ${extra || ""}

    <p>—<br/>Mavhu Team</p>

    <p><small>This is an automated email. Please do not reply.</small></p>
  </body>
</html>
  `;
}

/**
 * Send verification email for registration
 */
async function sendVerificationEmail({ to, fullName, otp }) {
  const subject = "Verify Your Email - Mavhu";
  const title = "Welcome to Mavhu";
  const message = `Hi ${fullName},\n\nPlease verify your email address using the code below to complete your registration.`;

  const html = generateEmailTemplate({
    title,
    message,
    otpCode: otp,
  });

  await sendEmail({ to, subject, html });
}

/**
 * Send account deletion confirmation email
 */
async function sendDeleteAccountEmail({ to, fullName, otp }) {
  const subject = "Confirm Account Deletion - Mavhu";
  const title = "Account Deletion Request";
  const message = `Hi ${fullName},\n\nWe received a request to delete your Mavhu account. Use the code below to confirm this action. If you did not request this, please ignore this email.`;

  const html = generateEmailTemplate({
    title,
    message,
    otpCode: otp,
  });

  await sendEmail({ to, subject, html });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail({ to, fullName, otp }) {
  const subject = "Reset Your Password - Mavhu";
  const title = "Password Reset";
  const message = `Hi ${fullName},\n\nWe received a request to reset your password. Use the code below to continue. If you did not request this, please ignore this email.`;

  const html = generateEmailTemplate({
    title,
    message,
    otpCode: otp,
  });

  await sendEmail({ to, subject, html });
}

/**
 * Reservation confirmation email (customer)
 */
async function sendReservationCustomerEmail({ to, fullName, reservation }) {
  const subject = `Reservation Confirmed - ${reservation.code}`;
  const title = "Reservation Confirmed";

  const message = `Hi ${fullName},\n\nYour reservation has been confirmed. Below are the details.`;

  const extra = `
    <p><strong>Reservation Code:</strong> ${reservation.code}</p>
    <p><strong>Status:</strong> ${reservation.status}</p>
    <p><strong>Pickup Date:</strong> ${reservation.pickupAt}</p>
    <p><strong>Dropoff Date:</strong> ${reservation.dropoffAt}</p>
    <p><strong>Total:</strong> ${reservation.pricing?.currency || ""} ${
    reservation.pricing?.grand_total || "0.00"
  }</p>
  `;

  const html = generateEmailTemplate({
    title,
    message,
    extra,
  });

  await sendEmail({ to, subject, html });
}

/**
 * Reservation notification email (staff)
 */
async function sendReservationStaffEmail({
  to,
  fullName,
  reservation,
  customerInfo,
}) {
  const subject = `New Reservation - ${reservation.code}`;
  const title = "New Reservation Created";

  const message = `Hi ${fullName},\n\nA new reservation has been created.`;

  const extra = `
    <p><strong>Reservation Code:</strong> ${reservation.code}</p>
    <p><strong>Customer:</strong> ${customerInfo || "N/A"}</p>
    <p><strong>Status:</strong> ${reservation.status}</p>
    <p><strong>Total:</strong> ${reservation.pricing?.currency || ""} ${
    reservation.pricing?.grand_total || "0.00"
  }</p>
  `;

  const html = generateEmailTemplate({
    title,
    message,
    extra,
  });

  await sendEmail({ to, subject, html });
}

/**
 * Base email sender
 */
async function sendEmail({ to, subject, text, html }) {
  const mailOptions = {
    from: `Mavhu <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html: html || text,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendDeleteAccountEmail,
  sendPasswordResetEmail,
  sendReservationCustomerEmail,
  sendReservationStaffEmail,
};
