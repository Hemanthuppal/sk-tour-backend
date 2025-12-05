const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_costs WHERE tour_id = ? ORDER BY pax ASC`,
      [req.params.tour_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/', async (req, res) => {
  const { tour_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed } = req.body;

  if (!tour_id || !pax) {
    return res.status(400).json({ message: "tour_id and pax are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_costs (tour_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tour_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed]
    );

    res.status(201).json({ cost_id: result.insertId, message: "Cost added successfully" });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { tour_id, costs } = req.body;

  if (!tour_id || !Array.isArray(costs) || costs.length === 0) {
    return res.status(400).json({
      message: 'tour_id and costs[] are required'
    });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = costs.map((c, idx) => [
      tour_id,
      Number(c.pax),
      c.standard_hotel ?? null,
      c.deluxe_hotel ?? null,
      c.executive_hotel ?? null,
      c.child_with_bed ?? null,
      c.child_no_bed ?? null
    ]);

    await conn.query(
      `INSERT INTO tour_costs 
        (tour_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${costs.length} cost slabs added successfully`,
      tour_id,
      added_count: costs.length
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

router.put('/:cost_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_costs SET ? WHERE cost_id = ?`,
      [req.body, req.params.cost_id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: "Not found" });

    res.json({ message: "Updated successfully" });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:cost_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_costs WHERE cost_id = ?`, [req.params.cost_id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
