const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_SENDER = process.env.EMAIL_FROM || 'Sadnaot <noreply@sadnaot.online>';

/**
 * Shared Email Sender
 * @param {Object} params
 * @param {string} params.to - Recipient
 * @param {string} params.subject - Subject
 * @param {string} params.html - HTML Body
 * @param {string} [params.text] - Optional Plain Text
 * @param {Array} [params.attachments] - Optional Attachments [{ filename, content }]
 */
exports.sendEmail = async ({ to, subject, html, text, attachments }) => {
  try {
    // Auto-generate plain text if not provided
    const plainText = text || html.replace(/<[^>]*>?/gm, '');

    const data = await resend.emails.send({
      from: DEFAULT_SENDER,
      to: to,
      subject: subject,
      html: html,
      text: plainText,
      attachments: attachments // 👈 THIS IS CRITICAL FOR EXCEL EXPORT
    });

    if (data.error) {
      console.error(`❌ [EmailService] Failed to send to ${to}:`, data.error);
      return { success: false, error: data.error };
    }

    console.log(`✅ [EmailService] Sent to ${to} | ID: ${data.data?.id}`);
    return { success: true, id: data.data?.id };

  } catch (err) {
    console.error(`❌ [EmailService] Exception:`, err.message);
    return { success: false, error: err.message };
  }
};