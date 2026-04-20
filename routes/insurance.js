const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import your database configuration

// Generate unique insurance ID
async function generateInsuranceId() {
  const [rows] = await pool.execute(
    "SELECT insurance_id FROM insurance_form ORDER BY id DESC LIMIT 1"
  );
  
  let lastId = "INSF000000";
  if (rows.length > 0) {
    lastId = rows[0].insurance_id;
  }
  
  const num = parseInt(lastId.substring(4)) + 1;
  return `INSF${String(num).padStart(6, '0')}`;
}



// ============= CRUD OPERATIONS =============

// CREATE - POST - Insert new insurance form
router.post('/insurance', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const insuranceId = await generateInsuranceId();
    const formData = req.body.form;
    const familyMembers = req.body.familyMembers || [];
    
    // Insert main form data
    await connection.execute(
      `INSERT INTO insurance_form (
        insurance_id, first_name, middle_name, last_name, sex, date_of_birth, age,
        cell_no, address, landmark, city, pincode, state, country, passport_number,
        date_of_issue, date_of_expiry, place_of_issue, purpose_of_travel,
        any_existing_illness, include_usa_canada, exclude_usa_canada,
        date_of_travel, return_date, no_of_days, countries_to_visit, sum_insured,
        nominee_name, nominee_relationship, nominee_age, nominee_mobile, declaration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        insuranceId, formData.firstName, formData.middleName, formData.lastName,
        formData.sex, formData.dateOfBirth, formData.age, formData.cellNo,
        formData.address, formData.landmark, formData.city, formData.pincode,
        formData.state, formData.country, formData.passportNumber, formData.dateOfIssue,
        formData.dateOfExpiry, formData.placeOfIssue, formData.purposeOfTravel,
        formData.anyExistingIllness, formData.includeUSACanada ? 1 : 0,
        formData.excludeUSACanada ? 1 : 0, formData.dateOfTravel, formData.returnDate,
        formData.noOfDays, formData.countriesToVisit, formData.sumInsured,
        formData.nomineeName, formData.nomineeRelationship, formData.nomineeAge,
        formData.nomineeMobile, formData.declaration ? 1 : 0
      ]
    );
    
    // Insert family members
    for (const member of familyMembers) {
      if (member.name && member.name.trim()) {
        await connection.execute(
          `INSERT INTO family_members (
            insurance_id, name, pp_no, doi, doe, poi, dob, nominee, relation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insuranceId, member.name, member.ppNo, member.doi, member.doe,
            member.poi, member.dob, member.nominee, member.relation
          ]
        );
      }
    }
    
    await connection.commit();
    res.status(201).json({ 
      success: true, 
      message: 'Insurance form created successfully',
      insurance_id: insuranceId 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating form:', error);
    res.status(500).json({ success: false, message: 'Error creating insurance form', error: error.message });
  } finally {
    connection.release();
  }
});

// READ - GET - Fetch all insurance forms
router.get('/insurance', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM insurance_form ORDER BY created_at DESC'
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ success: false, message: 'Error fetching data', error: error.message });
  }
});

// READ - GET - Fetch single insurance form by ID
router.get('/insurance/:insuranceId', async (req, res) => {
  try {
    const [formRows] = await pool.execute(
      'SELECT * FROM insurance_form WHERE insurance_id = ?',
      [req.params.insuranceId]
    );
    
    if (formRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Insurance form not found' });
    }
    
    const [familyRows] = await pool.execute(
      'SELECT * FROM family_members WHERE insurance_id = ?',
      [req.params.insuranceId]
    );
    
    res.status(200).json({ 
      success: true, 
      data: { form: formRows[0], familyMembers: familyRows }
    });
  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ success: false, message: 'Error fetching data', error: error.message });
  }
});

// UPDATE - PUT - Update insurance form
// Helper function to convert undefined to null
const sanitizeForSQL = (value) => {
  return value === undefined ? null : value;
};

// UPDATE - PUT - Update insurance form
router.put('/insurance/:insuranceId', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const insuranceId = req.params.insuranceId;
    const formData = req.body.form;
    const familyMembers = req.body.familyMembers || [];
    
    // Check if form exists
    const [existing] = await connection.execute(
      'SELECT insurance_id FROM insurance_form WHERE insurance_id = ?',
      [insuranceId]
    );
    
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Insurance form not found' });
    }
    
    // Sanitize all form data - convert undefined to null
    const sanitizedData = {
      firstName: sanitizeForSQL(formData.firstName),
      middleName: sanitizeForSQL(formData.middleName),
      lastName: sanitizeForSQL(formData.lastName),
      sex: sanitizeForSQL(formData.sex),
      dateOfBirth: sanitizeForSQL(formData.dateOfBirth),
      age: sanitizeForSQL(formData.age),
      cellNo: sanitizeForSQL(formData.cellNo),
      address: sanitizeForSQL(formData.address),
      landmark: sanitizeForSQL(formData.landmark),
      city: sanitizeForSQL(formData.city),
      pincode: sanitizeForSQL(formData.pincode),
      state: sanitizeForSQL(formData.state),
      country: sanitizeForSQL(formData.country),
      passportNumber: sanitizeForSQL(formData.passportNumber),
      dateOfIssue: sanitizeForSQL(formData.dateOfIssue),
      dateOfExpiry: sanitizeForSQL(formData.dateOfExpiry),
      placeOfIssue: sanitizeForSQL(formData.placeOfIssue),
      purposeOfTravel: sanitizeForSQL(formData.purposeOfTravel),
      anyExistingIllness: sanitizeForSQL(formData.anyExistingIllness),
      includeUSACanada: formData.includeUSACanada ? 1 : 0,
      excludeUSACanada: formData.excludeUSACanada ? 1 : 0,
      dateOfTravel: sanitizeForSQL(formData.dateOfTravel),
      returnDate: sanitizeForSQL(formData.returnDate),
      noOfDays: sanitizeForSQL(formData.noOfDays),
      countriesToVisit: sanitizeForSQL(formData.countriesToVisit),
      sumInsured: sanitizeForSQL(formData.sumInsured),
      nomineeName: sanitizeForSQL(formData.nomineeName),
      nomineeRelationship: sanitizeForSQL(formData.nomineeRelationship),
      nomineeAge: sanitizeForSQL(formData.nomineeAge),
      nomineeMobile: sanitizeForSQL(formData.nomineeMobile),
      declaration: formData.declaration ? 1 : 0
    };
    
    // Update main form data
    await connection.execute(
      `UPDATE insurance_form SET
        first_name = ?, middle_name = ?, last_name = ?, sex = ?, date_of_birth = ?,
        age = ?, cell_no = ?, address = ?, landmark = ?, city = ?, pincode = ?,
        state = ?, country = ?, passport_number = ?, date_of_issue = ?,
        date_of_expiry = ?, place_of_issue = ?, purpose_of_travel = ?,
        any_existing_illness = ?, include_usa_canada = ?, exclude_usa_canada = ?,
        date_of_travel = ?, return_date = ?, no_of_days = ?, countries_to_visit = ?,
        sum_insured = ?, nominee_name = ?, nominee_relationship = ?, nominee_age = ?,
        nominee_mobile = ?, declaration = ?
      WHERE insurance_id = ?`,
      [
        sanitizedData.firstName, sanitizedData.middleName, sanitizedData.lastName,
        sanitizedData.sex, sanitizedData.dateOfBirth, sanitizedData.age, sanitizedData.cellNo,
        sanitizedData.address, sanitizedData.landmark, sanitizedData.city, sanitizedData.pincode,
        sanitizedData.state, sanitizedData.country, sanitizedData.passportNumber, sanitizedData.dateOfIssue,
        sanitizedData.dateOfExpiry, sanitizedData.placeOfIssue, sanitizedData.purposeOfTravel,
        sanitizedData.anyExistingIllness, sanitizedData.includeUSACanada, sanitizedData.excludeUSACanada,
        sanitizedData.dateOfTravel, sanitizedData.returnDate, sanitizedData.noOfDays, sanitizedData.countriesToVisit,
        sanitizedData.sumInsured, sanitizedData.nomineeName, sanitizedData.nomineeRelationship, sanitizedData.nomineeAge,
        sanitizedData.nomineeMobile, sanitizedData.declaration, insuranceId
      ]
    );
    
    // Delete existing family members and insert new ones
    await connection.execute('DELETE FROM family_members WHERE insurance_id = ?', [insuranceId]);
    
    for (const member of familyMembers) {
      if (member.name && member.name.trim()) {
        await connection.execute(
          `INSERT INTO family_members (
            insurance_id, name, pp_no, doi, doe, poi, dob, nominee, relation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insuranceId, 
            sanitizeForSQL(member.name), 
            sanitizeForSQL(member.ppNo), 
            sanitizeForSQL(member.doi), 
            sanitizeForSQL(member.doe),
            sanitizeForSQL(member.poi), 
            sanitizeForSQL(member.dob), 
            member.nominee ? 1 : 0, 
            sanitizeForSQL(member.relation)
          ]
        );
      }
    }
    
    await connection.commit();
    res.status(200).json({ success: true, message: 'Insurance form updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating form:', error);
    res.status(500).json({ success: false, message: 'Error updating insurance form', error: error.message });
  } finally {
    connection.release();
  }
});

// CREATE - POST - Create new insurance form
router.post('/insurance', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const formData = req.body.form;
    const familyMembers = req.body.familyMembers || [];
    
    // Generate insurance ID (you can modify this format as needed)
    const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM insurance_form');
    const count = countResult[0].count + 1;
    const insuranceId = `INSF${String(count).padStart(6, '0')}`;
    
    // Sanitize all form data - convert undefined to null
    const sanitizedData = {
      firstName: sanitizeForSQL(formData.firstName),
      middleName: sanitizeForSQL(formData.middleName),
      lastName: sanitizeForSQL(formData.lastName),
      sex: sanitizeForSQL(formData.sex),
      dateOfBirth: sanitizeForSQL(formData.dateOfBirth),
      age: sanitizeForSQL(formData.age),
      cellNo: sanitizeForSQL(formData.cellNo),
      address: sanitizeForSQL(formData.address),
      landmark: sanitizeForSQL(formData.landmark),
      city: sanitizeForSQL(formData.city),
      pincode: sanitizeForSQL(formData.pincode),
      state: sanitizeForSQL(formData.state),
      country: sanitizeForSQL(formData.country),
      passportNumber: sanitizeForSQL(formData.passportNumber),
      dateOfIssue: sanitizeForSQL(formData.dateOfIssue),
      dateOfExpiry: sanitizeForSQL(formData.dateOfExpiry),
      placeOfIssue: sanitizeForSQL(formData.placeOfIssue),
      purposeOfTravel: sanitizeForSQL(formData.purposeOfTravel),
      anyExistingIllness: sanitizeForSQL(formData.anyExistingIllness),
      includeUSACanada: formData.includeUSACanada ? 1 : 0,
      excludeUSACanada: formData.excludeUSACanada ? 1 : 0,
      dateOfTravel: sanitizeForSQL(formData.dateOfTravel),
      returnDate: sanitizeForSQL(formData.returnDate),
      noOfDays: sanitizeForSQL(formData.noOfDays),
      countriesToVisit: sanitizeForSQL(formData.countriesToVisit),
      sumInsured: sanitizeForSQL(formData.sumInsured),
      nomineeName: sanitizeForSQL(formData.nomineeName),
      nomineeRelationship: sanitizeForSQL(formData.nomineeRelationship),
      nomineeAge: sanitizeForSQL(formData.nomineeAge),
      nomineeMobile: sanitizeForSQL(formData.nomineeMobile),
      declaration: formData.declaration ? 1 : 0
    };
    
    // Insert main form data
    await connection.execute(
      `INSERT INTO insurance_form (
        insurance_id, first_name, middle_name, last_name, sex, date_of_birth,
        age, cell_no, address, landmark, city, pincode, state, country,
        passport_number, date_of_issue, date_of_expiry, place_of_issue,
        purpose_of_travel, any_existing_illness, include_usa_canada,
        exclude_usa_canada, date_of_travel, return_date, no_of_days,
        countries_to_visit, sum_insured, nominee_name, nominee_relationship,
        nominee_age, nominee_mobile, declaration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        insuranceId, sanitizedData.firstName, sanitizedData.middleName, sanitizedData.lastName,
        sanitizedData.sex, sanitizedData.dateOfBirth, sanitizedData.age, sanitizedData.cellNo,
        sanitizedData.address, sanitizedData.landmark, sanitizedData.city, sanitizedData.pincode,
        sanitizedData.state, sanitizedData.country, sanitizedData.passportNumber, sanitizedData.dateOfIssue,
        sanitizedData.dateOfExpiry, sanitizedData.placeOfIssue, sanitizedData.purposeOfTravel,
        sanitizedData.anyExistingIllness, sanitizedData.includeUSACanada, sanitizedData.excludeUSACanada,
        sanitizedData.dateOfTravel, sanitizedData.returnDate, sanitizedData.noOfDays, sanitizedData.countriesToVisit,
        sanitizedData.sumInsured, sanitizedData.nomineeName, sanitizedData.nomineeRelationship, sanitizedData.nomineeAge,
        sanitizedData.nomineeMobile, sanitizedData.declaration
      ]
    );
    
    // Insert family members
    for (const member of familyMembers) {
      if (member.name && member.name.trim()) {
        await connection.execute(
          `INSERT INTO family_members (
            insurance_id, name, pp_no, doi, doe, poi, dob, nominee, relation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insuranceId, 
            sanitizeForSQL(member.name), 
            sanitizeForSQL(member.ppNo), 
            sanitizeForSQL(member.doi), 
            sanitizeForSQL(member.doe),
            sanitizeForSQL(member.poi), 
            sanitizeForSQL(member.dob), 
            member.nominee ? 1 : 0, 
            sanitizeForSQL(member.relation)
          ]
        );
      }
    }
    
    await connection.commit();
    res.status(201).json({ success: true, message: 'Insurance form created successfully', insuranceId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating form:', error);
    res.status(500).json({ success: false, message: 'Error creating insurance form', error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE - Delete insurance form
router.delete('/insurance/:insuranceId', async (req, res) => {
  try {
    // Family members will be deleted automatically due to CASCADE
    const [result] = await pool.execute(
      'DELETE FROM insurance_form WHERE insurance_id = ?',
      [req.params.insuranceId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Insurance form not found' });
    }
    
    res.status(200).json({ success: true, message: 'Insurance form deleted successfully' });
  } catch (error) {
    console.error('Error deleting form:', error);
    res.status(500).json({ success: false, message: 'Error deleting insurance form', error: error.message });
  }
});

// SEARCH - Search insurance forms
router.get('/insurance/search/:query', async (req, res) => {
  try {
    const searchQuery = `%${req.params.query}%`;
    const [rows] = await pool.execute(
      `SELECT * FROM insurance_form 
       WHERE insurance_id LIKE ? 
       OR first_name LIKE ? 
       OR last_name LIKE ? 
       OR passport_number LIKE ?
       ORDER BY created_at DESC`,
      [searchQuery, searchQuery, searchQuery, searchQuery]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error searching forms:', error);
    res.status(500).json({ success: false, message: 'Error searching data', error: error.message });
  }
});

module.exports = router;