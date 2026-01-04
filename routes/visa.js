const express = require('express');
const router = express.Router();
const pool = require('../config/db');

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
    submission = []
  } = req.body;

  try {
    // Start a transaction
    await pool.query('START TRANSACTION');

    // 1️⃣ Delete existing visa data for this tour
    await pool.query('DELETE FROM tour_visa_details WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_forms WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_fees WHERE tour_id = ?', [tour_id]);
    await pool.query('DELETE FROM tour_visa_submission WHERE tour_id = ?', [tour_id]);

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

    // 6️⃣ Insert visa forms (with default values if not provided)
    const defaultForms = [
      {
        visa_type: 'Tourist Visa',
        download_text: 'Tourist Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        visa_type: 'Transit Visa',
        download_text: 'Transit Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      },
      {
        visa_type: 'Business Visa',
        download_text: 'Business Visa Form Download',
        download_action: 'Download',
        fill_action: 'Fill Manually'
      }
    ];

    const formsToInsert = visa_forms.length > 0 ? visa_forms : defaultForms;
    
    for (const form of formsToInsert) {
      await pool.query(
        'INSERT INTO tour_visa_forms (tour_id, visa_type, download_text, download_action, fill_action) VALUES (?, ?, ?, ?, ?)',
        [
          tour_id,
          form.type || form.visa_type,
          form.download_text,
          form.download_action,
          form.fill_action
        ]
      );
    }

    // 7️⃣ Insert visa fees
    for (let i = 0; i < visa_fees.length; i++) {
      const fee = visa_fees[i];
      await pool.query(
        'INSERT INTO tour_visa_fees (tour_id, row_type, tourist, transit, business, charges, row_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          tour_id,
          fee.type || '',
          fee.tourist || '',
          fee.transit || '',
          fee.business || '',
          fee.charges || '',
          i
        ]
      );
    }

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

    // Commit transaction
    await pool.query('COMMIT');

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
    console.error('Error saving visa data:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      details: 'Failed to save visa data'
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

    // Group visa details by type
    const tourist_visa = visaDetails[0].filter(item => item.type === 'tourist');
    const transit_visa = visaDetails[0].filter(item => item.type === 'transit');
    const business_visa = visaDetails[0].filter(item => item.type === 'business');
    const photo = visaDetails[0].filter(item => item.type === 'photo');

    res.json({
      success: true,
      tour_id: tourId,
      visa_details: visaDetails[0],
      visa_forms: visaForms[0],
      visa_fees: visaFees[0],
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

module.exports = router;