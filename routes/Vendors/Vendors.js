const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/vendors');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Helper function to generate next code
const generateNextCode = (prefix, lastCode) => {
  // If lastCode is null, undefined, or empty, start with 00001
  if (!lastCode || lastCode === 'NULL' || lastCode === null) {
    return `${prefix}00001`;
  }
  
  try {
    // Extract the numeric part using regex to handle any format
    const match = lastCode.match(/\d+/);
    if (!match) {
      return `${prefix}00001`;
    }
    
    const numericPart = parseInt(match[0], 10);
    const nextNumber = numericPart + 1;
    
    // Format with leading zeros (5 digits total)
    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error('Error generating next code:', error);
    return `${prefix}00001`;
  }
};

// GET next available codes
router.get('/vendors/next-codes', async (req, res) => {
  try {
    // Get last customer code (ignore NULL values)
    const [customerResult] = await pool.query(
      "SELECT customer_code FROM vendors WHERE customer_code IS NOT NULL AND customer_code != 'NULL' AND customer_code != '' ORDER BY id DESC LIMIT 1"
    );
    
    // Get last supplier code (ignore NULL values)
    const [supplierResult] = await pool.query(
      "SELECT supplier_code FROM vendors WHERE supplier_code IS NOT NULL AND supplier_code != 'NULL' AND supplier_code != '' ORDER BY id DESC LIMIT 1"
    );
    
    console.log('Customer Result:', customerResult);
    console.log('Supplier Result:', supplierResult);
    
    const lastCustomerCode = (customerResult && customerResult.length > 0) ? customerResult[0].customer_code : null;
    const lastSupplierCode = (supplierResult && supplierResult.length > 0) ? supplierResult[0].supplier_code : null;
    
    console.log('Last Customer Code:', lastCustomerCode);
    console.log('Last Supplier Code:', lastSupplierCode);
    
    const nextCustomerCode = generateNextCode('CUS', lastCustomerCode);
    const nextSupplierCode = generateNextCode('SUP', lastSupplierCode);
    
    console.log('Next Customer Code:', nextCustomerCode);
    console.log('Next Supplier Code:', nextSupplierCode);
    
    res.json({
      customer_code: nextCustomerCode,
      supplier_code: nextSupplierCode
    });
  } catch (error) {
    console.error('Error generating next codes:', error);
    // Return default values on error
    res.json({
      customer_code: 'CUS00001',
      supplier_code: 'SUP00001'
    });
  }
});

// GET all vendors with category name
router.get('/vendors', async (req, res) => {
  try {
    const sql = `
      SELECT v.*, c.name as category_name 
      FROM vendors v 
      LEFT JOIN vendor_categories c ON v.category_id = c.id 
      ORDER BY v.id DESC
    `;
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET single vendor by ID with category name
router.get('/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT v.*, c.name as category_name 
      FROM vendors v 
      LEFT JOIN vendor_categories c ON v.category_id = c.id 
      WHERE v.id = ?
    `;
    const [rows] = await pool.query(sql, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST create new vendor
// POST create new vendor
router.post('/vendors', upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 },
  { name: 'flip_front', maxCount: 1 },
  { name: 'flip_back', maxCount: 1 },
  { name: 'customer_profile', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      category_id = null,
      customer_code,
      supplier_code,
      title = null,
      first_name,
      last_name = null,
      position = null,
      company_name = null,
      website = null,
      email1 = null,
      email2 = null,
      mobile1 = null,
      mobile2 = null,
      mobile3 = null,
      mobile4 = null,
      landline = null,
      landline_code = null,
      remark = null,
      is_active = true,
      address1 = null,
      address2 = null,
      landmark = null,
      area = null,
      country = 'India',
      state = null,
      city = null,
      pin_code = null,
      visiting_card_type = null
    } = req.body;

    console.log('Received form data:', req.body);
    console.log('Files received:', req.files);

    if (!first_name) {
      return res.status(400).json({ error: 'First name is required' });
    }

    // Convert is_active to 1 or 0
    const activeStatus = is_active === 'true' || is_active === true ? 1 : 0;

    const files = req.files || {};
    const frontPath = files.front ? files.front[0].path : null;
    const backPath = files.back ? files.back[0].path : null;
    const flipFrontPath = files.flip_front ? files.flip_front[0].path : null;
    const flipBackPath = files.flip_back ? files.flip_back[0].path : null;
    const customerProfilePath = files.customer_profile ? files.customer_profile[0].path : null;

    const sql = `INSERT INTO vendors (
      category_id, customer_code, supplier_code, title, first_name, last_name, position, 
      company_name, website, email1, email2, mobile1, mobile2, 
      mobile3, mobile4, landline, landline_code, remark, is_active,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type,
      front_image, back_image, flip_front_image, flip_back_image, customer_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      category_id || null,           // 1
      customer_code || null,          // 2
      supplier_code || null,          // 3
      title || null,                  // 4
      first_name || null,             // 5
      last_name || null,              // 6
      position || null,               // 7
      company_name || null,           // 8
      website || null,                // 9
      email1 || null,                 // 10
      email2 || null,                 // 11
      mobile1 || null,                // 12
      mobile2 || null,                // 13
      mobile3 || null,                // 14
      mobile4 || null,                // 15
      landline || null,               // 16
      landline_code || null,          // 17
      remark || null,                 // 18
      activeStatus,                   // 19
      address1 || null,               // 20
      address2 || null,               // 21
      landmark || null,               // 22
      area || null,                   // 23
      country || 'India',             // 24
      state || null,                  // 25
      city || null,                   // 26
      pin_code || null,               // 27
      visiting_card_type || null,     // 28
      frontPath,                      // 29
      backPath,                       // 30
      flipFrontPath,                  // 31
      flipBackPath,                   // 32
      customerProfilePath             // 33
    ];

    console.log('SQL:', sql);
    console.log('Values count:', values.length);
    console.log('Values:', values);

    const [result] = await pool.query(sql, values);
    const [newVendor] = await pool.query('SELECT * FROM vendors WHERE id = ?', [result.insertId]);
    
    res.status(201).json({
      message: 'Vendor created successfully',
      vendor: newVendor[0]
    });

  } catch (error) {
    console.error('Error creating vendor:', error);
    
    // Handle duplicate code error
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('customer_code')) {
        return res.status(400).json({ error: 'Customer code already exists' });
      } else if (error.message.includes('supplier_code')) {
        return res.status(400).json({ error: 'Supplier code already exists' });
      }
    }
    
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// PUT update vendor
router.put('/vendors/:id', upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 },
  { name: 'flip_front', maxCount: 1 },
  { name: 'flip_back', maxCount: 1 },
  { name: 'customer_profile', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    
    const {
      category_id, customer_code, supplier_code, title, first_name, last_name, position,
      company_name, website, email1, email2, mobile1, mobile2,
      mobile3, mobile4, landline, landline_code, remark, is_active,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type
    } = req.body;

    const files = req.files || {};
    
    let updateFields = [];
    let values = [];

    // Add text fields if they exist
    const textFields = {
      category_id, customer_code, supplier_code, title, first_name, last_name, position,
      company_name, website, email1, email2, mobile1, mobile2,
      mobile3, mobile4, landline, landline_code, remark,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type
    };

    Object.keys(textFields).forEach(key => {
      if (req.body[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        // Convert empty string to null for database
        values.push(req.body[key] === '' ? null : textFields[key]);
      }
    });

    // Handle is_active separately
    if (req.body.is_active !== undefined) {
      updateFields.push('is_active = ?');
      const activeStatus = req.body.is_active === 'true' || req.body.is_active === true ? 1 : 0;
      values.push(activeStatus);
    }

    // Add file fields if uploaded
    if (files.front) {
      updateFields.push('front_image = ?');
      values.push(files.front[0].path);
    }
    if (files.back) {
      updateFields.push('back_image = ?');
      values.push(files.back[0].path);
    }
    if (files.flip_front) {
      updateFields.push('flip_front_image = ?');
      values.push(files.flip_front[0].path);
    }
    if (files.flip_back) {
      updateFields.push('flip_back_image = ?');
      values.push(files.flip_back[0].path);
    }
    if (files.customer_profile) {
      updateFields.push('customer_profile = ?');
      values.push(files.customer_profile[0].path);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const sql = `UPDATE vendors SET ${updateFields.join(', ')} WHERE id = ?`;

    const [result] = await pool.query(sql, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const [updatedVendor] = await pool.query('SELECT * FROM vendors WHERE id = ?', [id]);
    
    res.json({
      message: 'Vendor updated successfully',
      vendor: updatedVendor[0]
    });

  } catch (error) {
    console.error('Error updating vendor:', error);
    
    // Handle duplicate code error
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('customer_code')) {
        return res.status(400).json({ error: 'Customer code already exists' });
      } else if (error.message.includes('supplier_code')) {
        return res.status(400).json({ error: 'Supplier code already exists' });
      }
    }
    
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// DELETE vendor
router.delete('/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM vendors WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({ 
      message: 'Vendor deleted successfully',
      id: parseInt(id)
    });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET all categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, created_at, updated_at FROM vendor_categories ORDER BY name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET single category by ID
router.get('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT id, name, created_at, updated_at FROM vendor_categories WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST add new category
router.post('/categories/add-category', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const trimmedName = name.trim();

    // Check if category already exists
    const [existing] = await pool.query(
      'SELECT id FROM vendor_categories WHERE name = ?',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        message: 'Category already exists',
        error: 'Duplicate entry' 
      });
    }

    const [result] = await pool.query(
      'INSERT INTO vendor_categories (name) VALUES (?)',
      [trimmedName]
    );

    res.status(201).json({ 
      message: 'Category added successfully',
      category: { 
        id: result.insertId,
        name: trimmedName 
      }
    });
  } catch (error) {
    console.error('Error adding category:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: 'Category already exists',
        error: 'Duplicate entry' 
      });
    }
    
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// PUT update category
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const trimmedName = name.trim();

    const [existing] = await pool.query(
      'SELECT id, name FROM vendor_categories WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const [nameExists] = await pool.query(
      'SELECT id FROM vendor_categories WHERE name = ? AND id != ?',
      [trimmedName, id]
    );

    if (nameExists.length > 0) {
      return res.status(400).json({ 
        message: 'Category name already exists',
        error: 'Duplicate entry' 
      });
    }

    await pool.query(
      'UPDATE vendor_categories SET name = ? WHERE id = ?',
      [trimmedName, id]
    );

    res.json({ 
      message: 'Category updated successfully',
      category: { 
        id: parseInt(id),
        name: trimmedName 
      }
    });
  } catch (error) {
    console.error('Error updating category:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: 'Category name already exists',
        error: 'Duplicate entry' 
      });
    }
    
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE category
router.delete('/venodorcategory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await pool.query('SELECT id FROM vendor_categories WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ 
        error: 'Category not found',
        message: `Category with ID ${id} does not exist` 
      });
    }

    const [result] = await pool.query('DELETE FROM vendor_categories WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(400).json({ 
        error: 'Delete failed',
        message: 'No rows were deleted' 
      });
    }

    res.json({ 
      success: true,
      message: "Category deleted successfully",
      deletedId: id 
    });
    
  } catch (error) {
    console.error('Error deleting category:', error);
    
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(400).json({ 
        error: 'Cannot delete category',
        message: 'This category is being used by vendors and cannot be deleted' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete category',
      message: error.message 
    });
  }
});

module.exports = router;