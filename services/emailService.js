const nodemailer = require('nodemailer');
const fs = require('fs').promises; // Using promises version for better async handling
const path = require('path');
const handlebars = require('handlebars');
const BASE_URL_UPLOAD = "http://localhost:3000/uploads";

// Create transporter with better configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Temporary fix for SSL issues
  }
});

let emailTemplate;
let templateLoaded = false;

// Load template with error handling
async function loadEmailTemplate() {
  try {
    const templatePath = path.join(__dirname, '../templates/ticketEmail.hbs');
    const templateContent = await fs.readFile(templatePath, 'utf8');
    emailTemplate = handlebars.compile(templateContent);
    templateLoaded = true;
  } catch (err) {
    console.error('Failed to load email template:', err);
    templateLoaded = false;
  }
}

// Load template immediately when module loads
loadEmailTemplate();

async function sendTicketEmail({ 
  to, 
  userName, 
  festivalName, 
  amount, 
  qrCodeUrl, 
  verificationCode 
}) {
  if (!to || !userName || !festivalName || !verificationCode) {
    throw new Error('Missing required email parameters');
  }

  if (!templateLoaded) {
    await loadEmailTemplate();
    if (!templateLoaded) {
      throw new Error('Email template failed to load');
    }
  }

  try {
    const mailOptions = {
      from: `Festival App <${process.env.EMAIL_USER}>`,
      to,
      subject: `Your Ticket for ${festivalName}`,
      html: emailTemplate({
        userName,
        festivalName,
        amount: amount || 'N/A',
        verificationCode,
        qrCodeUrl: qrCodeUrl || '#',
        currentYear: new Date().getFullYear()
      }),
      attachments: qrCodeUrl ? [{
        filename: 'ticket_qr.png',
        path: qrCodeUrl.replace(
          BASE_URL_UPLOAD, 
          path.join(__dirname, '../public/downloads')
        ),
        cid: 'ticket_qr'
      }] : []
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    throw err;
  }
}

module.exports = { 
  sendTicketEmail,
  loadEmailTemplate // Export for manual reload if needed
};