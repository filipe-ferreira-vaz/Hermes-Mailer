const nodemailer = require('nodemailer');

/**
 * Create and cache the Nodemailer transporter.
 * Used ONLY for "Send Immediately" — scheduled emails go through Google Sheets + Apps Script.
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // Use STARTTLS for port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email immediately via SMTP.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - Full HTML email body
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendEmail(to, subject, htmlBody) {
  try {
    const transport = getTransporter();

    const fromName = process.env.EMAIL_FROM_NAME || 'Hermes Dashboard';
    const fromEmail = process.env.SMTP_USER;

    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to,
      subject: subject,
      html: htmlBody,
    });

    console.log(`[Mailer] Email sent to ${to}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Replace all {{placeholder}} tokens in a template string with values.
 * Also converts plain-text newlines to <br> tags for HTML rendering.
 * @param {string} templateStr - Template string with {{key}} placeholders
 * @param {object} variables - Key-value map of variables to substitute
 * @returns {string} Rendered string
 */
function renderTemplate(templateStr, variables) {
  if (!templateStr) return '';

  let rendered = templateStr;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, value || '');
  }

  // Convert plain-text newlines to <br> if the template doesn't already
  // contain block-level HTML elements (i.e. it's mostly plain text)
  const hasBlockHtml = /<(p|div|table|ul|ol|h[1-6]|br)\b/i.test(rendered);
  if (!hasBlockHtml) {
    rendered = rendered.replace(/\n/g, '<br>\n');
  }

  return rendered;
}

/**
 * Combine rendered body HTML and signature HTML into a clean email.
 * Minimal wrapper — no forced fonts, no centering, no max-width.
 * This makes emails look like they were composed natively in Gmail.
 * @param {string} bodyHtml - Rendered email body HTML
 * @param {string} signatureHtml - Signature HTML (optional)
 * @returns {string} Email HTML content
 */
function buildEmailHtml(bodyHtml, signatureHtml) {
  let html = `<div dir="ltr">${bodyHtml}`;

  if (signatureHtml) {
    html += `<div class="gmail_signature">${signatureHtml}</div>`;
  }

  html += '</div>';
  return html;
}

module.exports = {
  sendEmail,
  renderTemplate,
  buildEmailHtml
};
