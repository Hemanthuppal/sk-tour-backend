// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/db');


// routes/Vendors/Vendors.js (or wherever your vendor routes are)
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/vendors'); // Make sure this directory exists
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
      category_id, title, first_name, last_name, position, 
      company_name, website, email1, email2, mobile1, mobile2, 
      mobile3, mobile4, landline, landline_code, remark, is_active,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type,
      front_image, back_image, flip_front_image, flip_back_image, customer_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      category_id, title, first_name, last_name, position,
      company_name, website, email1, email2, mobile1, mobile2,
      mobile3, mobile4, landline, landline_code, remark, activeStatus,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type,
      frontPath, backPath, flipFrontPath, flipBackPath, customerProfilePath
    ];

    const [result] = await pool.query(sql, values);
    const [newVendor] = await pool.query('SELECT * FROM vendors WHERE id = ?', [result.insertId]);
    
    res.status(201).json({
      message: 'Vendor created successfully',
      vendor: newVendor[0]
    });

  } catch (error) {
    console.error('Error creating vendor:', error);
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
      category_id, title, first_name, last_name, position,
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
      category_id, title, first_name, last_name, position,
      company_name, website, email1, email2, mobile1, mobile2,
      mobile3, mobile4, landline, landline_code, remark,
      address1, address2, landmark, area, country, state, city,
      pin_code, visiting_card_type
    };

    Object.keys(textFields).forEach(key => {
      if (req.body[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        values.push(textFields[key]);
      }
    });

    // Handle is_active separately - convert to 1 or 0
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

    // Validation
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

    // Insert new category
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
    
    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: 'Category already exists',
        error: 'Duplicate entry' 
      });
    }
    
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// PUT update category by ID
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const trimmedName = name.trim();

    // Check if category exists
    const [existing] = await pool.query(
      'SELECT id, name FROM vendor_categories WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if new name already exists for a different category
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

    // Update category
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
    
    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: 'Category name already exists',
        error: 'Duplicate entry' 
      });
    }
    
    res.status(500).json({ error: 'Failed to update category' });
  }
});



router.delete('/venodorcategory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if the category exists
    const [existing] = await pool.query('SELECT id FROM vendor_categories WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ 
        error: 'Category not found',
        message: `Category with ID ${id} does not exist` 
      });
    }

    // Perform the delete operation
    const [result] = await pool.query('DELETE FROM vendor_categories WHERE id = ?', [id]);
    
    // Check if any rows were affected
    if (result.affectedRows === 0) {
      return res.status(400).json({ 
        error: 'Delete failed',
        message: 'No rows were deleted' 
      });
    }

    // Success response
    res.json({ 
      success: true,
      message: "Category deleted successfully",
      deletedId: id 
    });
    
  } catch (error) {
    console.error('Error deleting category:', error);
    
    // Check for foreign key constraint errors
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