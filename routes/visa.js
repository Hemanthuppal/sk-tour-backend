const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const path = require('path');
const multer = require('multer');
const fs = require('fs'); // Add this import
const mime = require('mime-types');



// Configure multer for visa form file uploads
const visaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/visa');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const tourId = req.params.tour_id || 'temp';
    const visaType = req.body.visa_type || 'unknown';
    const actionType = req.body.action_type || 'action';
    
    // Clean up names for filename safety
    const cleanVisaType = visaType.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const cleanActionType = actionType.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    
    // Get file extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Generate filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `visa-${tourId}-${cleanVisaType}-${cleanActionType}-${timestamp}-${randomStr}${ext}`;
    
    cb(null, fileName);
  }
});


// File filter to accept only PDF and Word documents
const visaFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and Word documents are allowed'), false);
  }
};


const uploadVisaFile = multer({ 
  storage: visaStorage,
  fileFilter: visaFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});






// ============================================
// BULK SAVE ALL VISA DATA FOR A TOUR
// ============================================
// ============================================
// BULK SAVE ALL VISA DATA FOR A TOUR
// ============================================
router.post('/bulk', async (req, res) => {
  try {
    const { 
      tour_id, 
      tourist_visa = [], 
      transit_visa = [], 
      business_visa = [], 
      photo = [], 
      visa_forms = [],
      visa_fees = [],
      submission = [],
      tourist_visa_remarks = ''
    } = req.body;

    console.log('📥 Received visa bulk data:', {
      tour_id,
      tourist_visa_count: tourist_visa.length,
      transit_visa_count: transit_visa.length,
      business_visa_count: business_visa.length,
      photo_count: photo.length,
      visa_forms_count: visa_forms.length,
      visa_fees_count: visa_fees.length,
      submission_count: submission.length,
      tourist_visa_remarks_length: tourist_visa_remarks?.length || 0
    });

    // Validate tour_id
    if (!tour_id) {
      return res.status(400).json({
        success: false,
        error: 'tour_id is required'
      });
    }

    // Start a transaction
    await pool.query('START TRANSACTION');

    // 1️⃣ Delete existing visa data for this tour
    console.log('🗑️ Deleting existing visa data for tour:', tour_id);
    
    // Execute deletes in sequence to avoid foreign key constraints
    await pool.query('DELETE FROM tour_visa_submission WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_fees WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_forms WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_details WHERE tour_id = ?', [tour_id]);

    console.log('✅ Deleted existing visa data');

    // 2️⃣ Insert tourist visa items
    if (tourist_visa && Array.isArray(tourist_visa)) {
      for (const item of tourist_visa) {
        if (item && item.description && item.description.trim()) {
          await pool.query(
            'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
            [tour_id, 'tourist', item.description.trim()]
          );
        }
      }
    }

    // 3️⃣ Insert transit visa items
    if (transit_visa && Array.isArray(transit_visa)) {
      for (const item of transit_visa) {
        if (item && item.description && item.description.trim()) {
          await pool.query(
            'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
            [tour_id, 'transit', item.description.trim()]
          );
        }
      }
    }

    // 4️⃣ Insert business visa items
    if (business_visa && Array.isArray(business_visa)) {
      for (const item of business_visa) {
        if (item && item.description && item.description.trim()) {
          await pool.query(
            'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
            [tour_id, 'business', item.description.trim()]
          );
        }
      }
    }

    // 5️⃣ Insert photo items
    if (photo && Array.isArray(photo)) {
      for (const item of photo) {
        if (item && item.description && item.description.trim()) {
          await pool.query(
            'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
            [tour_id, 'photo', item.description.trim()]
          );
        }
      }
    }

    console.log('✅ Inserted visa details');

    // 6️⃣ Insert visa forms with remarks - FIXED VERSION
    const defaultForms = [
      {
        visa_type: 'Tourist Visa',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        visa_type: 'Transit Visa',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        visa_type: 'Business Visa',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      }
    ];

    // Use provided forms or default forms
    const formsToInsert = (visa_forms && visa_forms.length > 0) ? visa_forms : defaultForms;
    
    console.log('📄 Forms to insert:', formsToInsert.length);

    for (const form of formsToInsert) {
      // Extract filenames from file paths
      const action1File = form.action1_file ? extractFilename(form.action1_file) : null;
      const action2File = form.action2_file ? extractFilename(form.action2_file) : null;
      
      // Get visa_type - use whichever field exists
      const visaType = form.visa_type || form.type || 'Tourist Visa';
      
      console.log(`📄 Inserting form: ${visaType}`, {
        visaType: visaType,
        download_action: form.download_action || 'Download',
        fill_action: form.fill_action || 'Fill Manually',
        action1File: action1File,
        action2File: action2File,
        remarks: tourist_visa_remarks || ''
      });
      
      // Fixed INSERT query - removed download_text
      await pool.query(
        'INSERT INTO tour_visa_forms (tour_id, visa_type, download_action, fill_action, action1_file, action2_file, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          tour_id,
          visaType,
          form.download_action || 'Download',
          form.fill_action || 'Fill Manually',
          action1File,
          action2File,
          tourist_visa_remarks || ''
        ]
      );
    }

    console.log('✅ Inserted visa forms');

    // 7️⃣ Insert visa fees
    if (visa_fees && Array.isArray(visa_fees)) {
      for (let i = 0; i < visa_fees.length; i++) {
        const fee = visa_fees[i];
        
        if (fee) {
          await pool.query(
            'INSERT INTO tour_visa_fees (tour_id, row_type, tourist, transit, business, tourist_charges, transit_charges, business_charges, row_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              tour_id,
              fee.type || fee.row_type || '',
              fee.tourist || '',
              fee.transit || '',
              fee.business || '',
              fee.tourist_charges || '',
              fee.transit_charges || '',
              fee.business_charges || '',
              i
            ]
          );
        }
      }
    }

    console.log('✅ Inserted visa fees');

    // 8️⃣ Insert submission data
    if (submission && Array.isArray(submission)) {
      for (let i = 0; i < submission.length; i++) {
        const item = submission[i];
        
        if (item) {
          await pool.query(
            'INSERT INTO tour_visa_submission (tour_id, label, tourist, transit, business, row_order) VALUES (?, ?, ?, ?, ?, ?)',
            [
              tour_id,
              item.label || '',
              item.tourist || '',
              item.transit || '',
              item.business || '',
              i
            ]
          );
        }
      }
    }

    console.log('✅ Inserted submission data');

    // Commit transaction
    await pool.query('COMMIT');

    console.log('✅ Transaction committed successfully');

    res.json({
      success: true,
      message: 'Visa data saved successfully',
      tour_id: tour_id,
      counts: {
        tourist_visa: tourist_visa?.length || 0,
        transit_visa: transit_visa?.length || 0,
        business_visa: business_visa?.length || 0,
        photo: photo?.length || 0,
        visa_forms: formsToInsert.length,
        visa_fees: visa_fees?.length || 0,
        submission: submission?.length || 0
      }
    });

  } catch (err) {
    // Rollback on error
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('❌ Rollback failed:', rollbackErr.message);
    }
    
    console.error('❌ Error saving visa data:', err.message);
    console.error('❌ Stack trace:', err.stack);
    console.error('❌ Error code:', err.code);
    console.error('❌ SQL State:', err.sqlState);
    
    res.status(500).json({
      success: false,
      error: 'Failed to save visa data',
      message: err.message,
      code: err.code,
      sqlState: err.sqlState
    });
  }
});

// Helper function to extract filename from path
const extractFilename = (filePath) => {
  if (!filePath) return null;
  
  // If it's already just a filename
  if (typeof filePath === 'string') {
    // Check if it's a full path
    const parts = filePath.split('/');
    const lastPart = parts[parts.length - 1];
    
    // Check if it's a URL or just a filename
    if (lastPart.includes('.') || lastPart.trim() === '') {
      return lastPart;
    }
    return filePath;
  }
  
  // If it's a File object
  if (filePath && typeof filePath === 'object' && filePath.name) {
    return filePath.name;
  }
  
  return null;
};

// ============================================
// UPLOAD VISA FORM FILE (FIXED VERSION)
// ============================================
router.post('/upload-file/:tour_id', uploadVisaFile.single('file'), async (req, res) => {
  try {
    const tourId = req.params.tour_id;
    
    console.log('📤 Visa file upload request:', {
      tourId,
      visa_type: req.body.visa_type,
      action_type: req.body.action_type,
      file: req.file ? req.file.originalname : 'No file'
    });

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded or invalid file type' 
      });
    }

    const { visa_type, action_type } = req.body;
    
    if (!visa_type) {
      // Clean up the uploaded file if validation fails
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        success: false, 
        error: 'visa_type is required' 
      });
    }

    // Get the generated filename
    const fileName = req.file.filename;
    
    // Return success response with file info
    res.json({
      success: true,
      fileName: fileName,
      originalName: req.file.originalname,
      fileUrl: `/uploads/visa/${fileName}`,
      visa_type: visa_type,
      action_type: action_type || 'unknown',
      size: req.file.size,
      message: 'File uploaded successfully'
    });

  } catch (err) {
    console.error('❌ Visa file upload error:', err);
    
    // Clean up file if error occurred
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: 'Failed to upload visa file'
    });
  }
});


// ============================================
// SERVE VISA FORM FILE (FIXED VERSION)
// ============================================
router.get('/file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    
    const filePath = path.join(__dirname, '../public/uploads/visa', safeFilename);
    
    console.log('📥 Serving visa file:', safeFilename);

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType;
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.doc') {
      contentType = 'application/msword';
    } else if (ext === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      contentType = mime.lookup(ext) || 'application/octet-stream';
    }

    // Set headers
    res.setHeader('Content-Type', contentType);
    
    // For PDFs, open in browser; for Word docs, download
    if (ext === '.pdf') {
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    }
    
    // Send file
    res.sendFile(filePath);
    
  } catch (err) {
    console.error('❌ Error serving file:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});



// ============================================
// DELETE VISA FORM FILE
// ============================================
router.delete('/file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../public/uploads/visa', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Delete file from filesystem
    fs.unlinkSync(filePath);
    
    // Remove reference from database
    await pool.query(
      'UPDATE tour_visa_forms SET action1_file = NULL WHERE action1_file = ?',
      [safeFilename]
    );
    
    await pool.query(
      'UPDATE tour_visa_forms SET action2_file = NULL WHERE action2_file = ?',
      [safeFilename]
    );

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (err) {
    console.error('❌ Error deleting file:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});



// ============================================
// GET ALL VISA DATA FOR A TOUR
// ============================================
router.get('/tour/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    // Get all visa data in parallel
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    // Process visa forms to include file URLs
    const processedForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));

    // Group visa details by type
    const tourist_visa = visaDetails[0].filter(item => item.type === 'tourist');
    const transit_visa = visaDetails[0].filter(item => item.type === 'transit');
    const business_visa = visaDetails[0].filter(item => item.type === 'business');
    const photo = visaDetails[0].filter(item => item.type === 'photo');

    // Process visa fees to handle charges correctly
    const processedVisaFees = visaFees[0].map(fee => ({
      ...fee,
      tourist_charges: fee.tourist_charges || '',
      transit_charges: fee.transit_charges || '',
      business_charges: fee.business_charges || ''
    }));

    res.json({
      success: true,
      tour_id: tourId,
      visa_details: visaDetails[0],
      visa_forms: processedForms,
      visa_fees: processedVisaFees,
      visa_submission: visaSubmission[0],
      grouped: {
        tourist_visa,
        transit_visa,
        business_visa,
        photo
      }
    });

  } catch (err) {
    console.error('Error fetching visa data:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      details: 'Failed to fetch visa data'
    });
  }
});

// ============================================
// CHECK IF TOUR IS INTERNATIONAL
// ============================================
router.get('/check-international/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const [tour] = await pool.query(
      'SELECT tour_id, tour_code, is_international FROM tours WHERE tour_id = ?',
      [tourId]
    );

    if (tour.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
    }

    res.json({
      success: true,
      is_international: tour[0].is_international === 1,
      tour_code: tour[0].tour_code
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET VISA DATA FOR FULL TOUR LOAD
// ============================================
router.get('/full/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    // Process for frontend format
    const touristVisaItems = visaDetails[0]
      .filter(item => item.type === 'tourist')
      .map(item => ({ description: item.description }));
    
    const transitVisaItems = visaDetails[0]
      .filter(item => item.type === 'transit')
      .map(item => ({ description: item.description }));
    
    const businessVisaItems = visaDetails[0]
      .filter(item => item.type === 'business')
      .map(item => ({ description: item.description }));
    
    const photoItems = visaDetails[0]
      .filter(item => item.type === 'photo')
      .map(item => ({ description: item.description }));

    // Process visa fees
    const processedVisaFees = visaFees[0].map(fee => ({
      id: fee.fee_id,
      type: fee.row_type,
      tourist: fee.tourist || '',
      transit: fee.transit || '',
      business: fee.business || '',
      tourist_charges: fee.tourist_charges || '',
      transit_charges: fee.transit_charges || '',
      business_charges: fee.business_charges || ''
    }));

    // Process submission rows
    const processedSubmissionRows = visaSubmission[0].map(item => ({
      id: item.submission_id,
      label: item.label,
      tourist: item.tourist,
      transit: item.transit,
      business: item.business
    }));

    // Process visa forms
    const processedVisaForms = visaForms[0].map(form => ({
      type: form.visa_type,
      download_action: form.download_action,
      fill_action: form.fill_action,
      action1_file: form.action1_file,
      action2_file: form.action2_file,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null,
      remarks: form.remarks || ''
    }));

    res.json({
      success: true,
      visa_details: visaDetails[0],
      visa_forms: processedVisaForms,
      visa_fees: processedVisaFees,
      visa_submission: processedSubmissionRows,
      tourist_visa: touristVisaItems,
      transit_visa: transitVisaItems,
      business_visa: businessVisaItems,
      photo: photoItems,
      tourist_visa_remarks: visaForms[0][0]?.remarks || ''
    });

  } catch (err) {
    console.error('Error fetching full visa data:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;