// backend/routes/email.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ADMIN_EMAIL = 'vangalatharun2001@gmail.com';
const ADMIN_APP_PASSWORD = 'zcja yyad cvgx bsyk';

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: ADMIN_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false 
  }
});

// Test the transporter
transporter.verify(function(error, success) {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer for FormData
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ============================================
// OPTION 1: Handle FormData (PDF file upload)
// ============================================
router.post('/send-tour-pdf', upload.single('pdf'), async (req, res) => {
  let pdfPath = '';

  try {
    console.log('=== Received FormData Email Request ===');
    console.log('Request body fields:', req.body);
    console.log('Uploaded file:', req.file ? 'Yes' : 'No');

    // ✅ ONLY required fields
    const { to, subject, message, tourTitle, tourCode } = req.body;

    // ✅ Validate only TO
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email (to) is required'
      });
    }

    // =========================
    // HANDLE PDF
    // =========================
    if (req.file) {
      const timestamp = Date.now();
      const pdfFilename = `tour_${tourCode || 'uploaded'}_${timestamp}.pdf`;
      pdfPath = path.join(tempDir, pdfFilename);
      fs.writeFileSync(pdfPath, req.file.buffer);
    } else {
      const timestamp = Date.now();
      const pdfFilename = `tour_${tourCode || 'details'}_${timestamp}.pdf`;
      pdfPath = path.join(tempDir, pdfFilename);

      const pdfDoc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const writeStream = fs.createWriteStream(pdfPath);
      pdfDoc.pipe(writeStream);

      pdfDoc.fontSize(28)
        .font('Helvetica-Bold')
        .text(tourTitle || 'TOUR DETAILS', { align: 'center', underline: true });

      pdfDoc.moveDown(2);
      pdfDoc.fontSize(14).text(`Tour Code: ${tourCode || 'N/A'}`);

      if (message) {
        pdfDoc.moveDown(1);
        pdfDoc.fontSize(12).text(`Message: ${message}`);
      }

      pdfDoc.moveDown(3);
      pdfDoc.fontSize(10)
        .text(`Generated on: ${new Date().toLocaleString()}`);

      pdfDoc.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }

    // =========================
    // SEND EMAIL
    // =========================
    const mailOptions = {
      from: `"Tour System" <${ADMIN_EMAIL}>`, // ✅ FIXED
      to,
      subject: subject || `Tour Details: ${tourTitle || ''}`,
      text: message || 'Please find attached the tour details.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Tour Details</h2>
          <p>${message || 'Please find attached the tour details.'}</p>
          <hr>
          <p><strong>Tour:</strong> ${tourTitle || 'N/A'}</p>
          <p><strong>Code:</strong> ${tourCode || 'N/A'}</p>
          <br>
          <p>This email was sent from Tour Management System.</p>
        </div>
      `,
      attachments: [{
        filename: path.basename(pdfPath),
        path: pdfPath,
        contentType: 'application/pdf'
      }]
    };

    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Error in send-tour-pdf:', error);

    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send email'
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      setTimeout(() => fs.unlink(pdfPath, () => {}), 5000);
    }
  }
});


// ============================================
// OPTION 2: Handle JSON only (Generate PDF from data)
// ============================================
router.post('/send-tour-pdf-json', async (req, res) => {
  let pdfPath = '';
  
  try {
    console.log('=== Received JSON Email Request ===');
    console.log('Request body:', req.body);
    
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Request body is missing'
      });
    }

    const { from, to, subject, message, tourDetails } = req.body;

    // Validate input
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From and To emails are required'
      });
    }

    // Generate unique PDF filename
    const timestamp = Date.now();
    const pdfFilename = `tour_${tourDetails?.tourId || 'details'}_${timestamp}.pdf`;
    pdfPath = path.join(tempDir, pdfFilename);

    // Create PDF with more details
    const pdfDoc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    const writeStream = fs.createWriteStream(pdfPath);
    pdfDoc.pipe(writeStream);

    // Add cover page
    pdfDoc.fontSize(28)
      .font('Helvetica-Bold')
      .text(tourDetails?.tourTitle || 'TOUR DETAILS', { 
        align: 'center',
        underline: true 
      });
    
    pdfDoc.moveDown(2);
    
    // Add logo or decorative line
    pdfDoc.rect(50, 120, 500, 3)
      .fillColor('#2E4D98')
      .fill();
    
    pdfDoc.moveDown(4);
    
    // Tour Information Table
    pdfDoc.fontSize(14).font('Helvetica-Bold').text('TOUR INFORMATION:', { underline: true });
    pdfDoc.moveDown(0.5);
    
    pdfDoc.font('Helvetica');
    
    if (tourDetails?.tourCode) {
      pdfDoc.text(`Tour Code: ${tourDetails.tourCode}`);
    }
    
    if (tourDetails?.tourType) {
      pdfDoc.text(`Tour Type: ${tourDetails.tourType}`);
    }
    
    if (tourDetails?.departure) {
      pdfDoc.moveDown();
      pdfDoc.font('Helvetica-Bold').text('DEPARTURE DETAILS:');
      pdfDoc.font('Helvetica');
      pdfDoc.text(`Month: ${tourDetails.departure.month || 'N/A'}`);
      pdfDoc.text(`Date: ${tourDetails.departure.date || 'N/A'}`);
      pdfDoc.text(`Price: ${tourDetails.departure.price || 'N/A'}`);
    }
    
    // Add more sections...
    pdfDoc.moveDown(2);
    pdfDoc.fontSize(12).font('Helvetica-Bold').text('What to Expect:', { underline: true });
    pdfDoc.moveDown(0.5);
    pdfDoc.font('Helvetica').fontSize(11);
    pdfDoc.text('• Complete tour itinerary and schedule');
    pdfDoc.text('• Hotel accommodation details');
    pdfDoc.text('• Transport and flight information');
    pdfDoc.text('• Cost breakdown and payment options');
    pdfDoc.text('• Booking and cancellation policies');
    
    pdfDoc.moveDown(3);
    pdfDoc.fontSize(10).font('Helvetica-Oblique').text('This is an automatically generated tour summary.');
    pdfDoc.text('For complete details, please visit our website or contact our customer service.');
    
    pdfDoc.moveDown(1);
    pdfDoc.fontSize(9).text(`Generated on: ${new Date().toLocaleString()}`);
    pdfDoc.text(`Sent via: Tour Management System`);
    
    // Add page numbers
    const pageCount = pdfDoc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      pdfDoc.switchToPage(i);
      pdfDoc.fontSize(8)
        .text(`Page ${i + 1} of ${pageCount}`, 50, pdfDoc.page.height - 30, {
          align: 'center',
          width: pdfDoc.page.width - 100
        });
    }

    pdfDoc.end();

    // Wait for PDF to finish writing
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Send email
    const mailOptions = {
      from: `"Tour System" <${ADMIN_EMAIL}>`,
      replyTo: from,
      to: to,
      subject: subject || `Tour Details: ${tourDetails?.tourTitle || ''}`,
      text: message || 'Please find attached the tour details.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Tour Details</h2>
          <p>${message || 'Please find attached the tour details.'}</p>
          <hr>
          <p><strong>Tour:</strong> ${tourDetails?.tourTitle || 'N/A'}</p>
          <p><strong>Code:</strong> ${tourDetails?.tourCode || 'N/A'}</p>
          <p><strong>Type:</strong> ${tourDetails?.tourType || 'N/A'}</p>
          <br>
          <p>This email was sent from Tour Management System.</p>
        </div>
      `,
      attachments: [{
        filename: pdfFilename,
        path: pdfPath,
        contentType: 'application/pdf'
      }]
    };

    console.log('Sending email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);

    // Send success response
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: info.messageId,
      pdfFilename: pdfFilename
    });

  } catch (error) {
    console.error('❌ Error in send-tour-pdf-json:', error);
    
    // Clean up temp file
    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send email and generate PDF' 
    });
  } finally {
    // Clean up temp file after delay
    if (pdfPath && fs.existsSync(pdfPath)) {
      setTimeout(() => {
        fs.unlink(pdfPath, (err) => {
          if (err) console.error('Error deleting temp file:', err);
        });
      }, 5000);
    }
  }
});

// ============================================
// OPTION 3: Simple email without attachment
// ============================================
router.post('/send-simple-email', async (req, res) => {
  try {
    console.log('=== Received Simple Email Request ===');
    
    const { from, to, subject, message, tourTitle, tourCode } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From and To emails are required'
      });
    }

    // Send email without attachment
    const mailOptions = {
      from: `"Tour System" <${ADMIN_EMAIL}>`,
      replyTo: from,
      to: to,
      subject: subject || `Tour Details: ${tourTitle || ''}`,
      text: message || 'Tour details requested.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Tour Details</h2>
          <p>${message || 'Tour details requested.'}</p>
          <hr>
          <p><strong>Tour:</strong> ${tourTitle || 'N/A'}</p>
          <p><strong>Code:</strong> ${tourCode || 'N/A'}</p>
          <br>
          <p>This email was sent from Tour Management System.</p>
          <p>For complete details, please contact our customer service.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Simple email sent:', info.messageId);
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Error in send-simple-email:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// Test endpoint to check if email service is working
// ============================================
router.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    const mailOptions = {
      from: `"Tour System" <${ADMIN_EMAIL}>`,
      to: email,
      subject: 'Test Email - Tour System',
      text: 'This is a test email from the Tour Management System.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email</h2>
          <p>This is a test email from the Tour Management System.</p>
          <p>If you received this email, the email service is working correctly.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Error in test-email:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'Email Service',
    status: 'Operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      sendFormData: 'POST /api/email/send-tour-pdf',
      sendJSON: 'POST /api/email/send-tour-pdf-json',
      sendSimple: 'POST /api/email/send-simple-email',
      test: 'POST /api/email/test-email'
    }
  });
});

module.exports = router;