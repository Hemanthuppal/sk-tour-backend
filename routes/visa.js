const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const path = require('path');
const multer = require('multer');
const fs = require('fs'); // Add this import


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../temp_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});


// ============================================
// BULK SAVE ALL VISA DATA FOR A TOUR
// ============================================
router.post('/bulk', async (req, res) => {
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

  try {
    // Start a transaction
    await pool.query('START TRANSACTION');

    // 1️⃣ Delete existing visa data for this tour
    await pool.query('DELETE FROM tour_visa_details WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_forms WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_fees WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_submission WHERE tour_id = ?', [tour_id]);

    console.log('✅ Deleted existing visa data');

    // 2️⃣ Insert tourist visa items
    for (const item of tourist_visa) {
      if (item.description && item.description.trim()) {
        await pool.query(
          'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
          [tour_id, 'tourist', item.description.trim()]
        );
      }
    }

    // 3️⃣ Insert transit visa items
    for (const item of transit_visa) {
      if (item.description && item.description.trim()) {
        await pool.query(
          'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
          [tour_id, 'transit', item.description.trim()]
        );
      }
    }

    // 4️⃣ Insert business visa items
    for (const item of business_visa) {
      if (item.description && item.description.trim()) {
        await pool.query(
          'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
          [tour_id, 'business', item.description.trim()]
        );
      }
    }

    // 5️⃣ Insert photo items
    for (const item of photo) {
      if (item.description && item.description.trim()) {
        await pool.query(
          'INSERT INTO tour_visa_details (tour_id, type, description) VALUES (?, ?, ?)',
          [tour_id, 'photo', item.description.trim()]
        );
      }
    }

    console.log('✅ Inserted visa details');

    // 6️⃣ Insert visa forms with remarks
    const defaultForms = [
      {
        type: 'Tourist Visa',
        download_text: 'Tourist Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        type: 'Transit Visa',
        download_text: 'Transit Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        type: 'Business Visa',
        download_text: 'Business Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      }
    ];

    const formsToInsert = visa_forms.length > 0 ? visa_forms : defaultForms;
    
    console.log('📄 Forms to insert:', formsToInsert.length);

    for (const form of formsToInsert) {
      // Handle file fields properly
      let action1File = form.action1_file;
      let action2File = form.action2_file;
      
      // Check if it's a string (already uploaded) or File object (needs upload)
      if (action1File && typeof action1File === 'object' && action1File.name) {
        // This is a File object - we'll handle it separately
        action1File = null; // Don't save file object directly
      } else if (!action1File || action1File === '' || action1File === 'null') {
        action1File = null;
      }
      
      if (action2File && typeof action2File === 'object' && action2File.name) {
        // This is a File object
        action2File = null;
      } else if (!action2File || action2File === '' || action2File === 'null') {
        action2File = null;
      }
      
      console.log(`📄 Inserting form: ${form.type}`);
      
      // Insert the form data
      await pool.query(
        'INSERT INTO tour_visa_forms (tour_id, visa_type, download_text, download_action, fill_action, action1_file, action2_file, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          tour_id,
          form.type || 'Tourist Visa',
          form.download_text || 'Tourist Visa Form Download',
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
    for (let i = 0; i < visa_fees.length; i++) {
      const fee = visa_fees[i];
      
      await pool.query(
        'INSERT INTO tour_visa_fees (tour_id, row_type, tourist, transit, business, tourist_charges, transit_charges, business_charges, row_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          tour_id,
          fee.type || '',
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

    console.log('✅ Inserted visa fees');

    // 8️⃣ Insert submission data
    for (let i = 0; i < submission.length; i++) {
      const item = submission[i];
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

    console.log('✅ Inserted submission data');

    // Commit transaction
    await pool.query('COMMIT');

    console.log('✅ Transaction committed successfully');

    res.json({
      success: true,
      message: 'Visa data saved successfully',
      tour_id: tour_id,
      counts: {
        tourist_visa: tourist_visa.length,
        transit_visa: transit_visa.length,
        business_visa: business_visa.length,
        photo: photo.length,
        visa_forms: formsToInsert.length,
        visa_fees: visa_fees.length,
        submission: submission.length
      }
    });

  } catch (err) {
    // Rollback on error
    await pool.query('ROLLBACK');
    console.error('❌ Error saving visa data:', err.message);
    console.error('❌ Stack trace:', err.stack);
    res.status(500).json({
      success: false,
      error: err.message,
      details: 'Failed to save visa data',
      stack: err.stack
    });
  }
});

// ============================================
// UPLOAD VISA FORM FILE (FIXED)
// ============================================
// routes/visa.js - Fix the /upload-file/:tour_id route
router.post('/upload-file/:tour_id', upload.single('file'), async (req, res) => {
  try {
    const tourId = req.params.tour_id;
    
    // Debug log
    console.log('📤 Visa file upload request received:', {
      tourId,
      body: req.body,
      file: req.file ? req.file.originalname : 'No file'
    });

    // Check if file exists
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    // Get visa_type from body - handle both form-data and JSON
    const { visa_type, action_type } = req.body;
    
    if (!visa_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'visa_type is required in request body' 
      });
    }

    // Generate unique filename
    const originalName = req.file.originalname;
    const fileExt = path.extname(originalName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = `visa-${tourId}-${visa_type.replace(/\s+/g, '-')}-${action_type}-${uniqueSuffix}${fileExt}`;
    
    // Define upload path
    const uploadDir = path.join(__dirname, '../public/uploads/visa');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);

    // Move file to destination
    fs.renameSync(req.file.path, filePath);

    console.log('✅ Visa file uploaded successfully:', {
      fileName,
      filePath,
      visa_type,
      action_type
    });

    res.json({
      success: true,
      fileName: fileName,
      filePath: `/uploads/visa/${fileName}`,
      visa_type: visa_type,
      action_type: action_type,
      message: 'File uploaded successfully'
    });

  } catch (err) {
    console.error('❌ Visa file upload error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: 'Failed to upload visa file'
    });
  }
});


// ============================================
// GET VISA FORM FILE
// ============================================
router.get('/file/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads/visa', filename);
  
  console.log('📥 Requesting file:', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }
});

// ============================================
// DELETE ALL VISA DATA FOR A TOUR
// ============================================
router.delete('/tour/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    await pool.query('START TRANSACTION');

    await pool.query('DELETE FROM tour_visa_details WHERE tour_id = ?', [tourId]);
    await pool.query('DELETE FROM tour_visa_forms WHERE tour_id = ?', [tourId]);
    await pool.query('DELETE FROM tour_visa_fees WHERE tour_id = ?', [tourId]);
    await pool.query('DELETE FROM tour_visa_submission WHERE tour_id = ?', [tourId]);

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Visa data deleted successfully',
      tour_id: tourId
    });

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error deleting visa data:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      details: 'Failed to delete visa data'
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
      download_text: form.download_text,
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