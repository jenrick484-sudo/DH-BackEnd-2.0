const express = require("express");
const router = express.Router();
const pool = require("../db");

// ADD SALE
router.post("/sales", async (req, res) => {
  const { item_id, qty, date } = req.body;

  try {
    const item = await pool.query("SELECT * FROM items WHERE id=$1", [item_id]);

    if (item.rows.length === 0) {
      return res.json({ success: false, message: "Item not found" });
    }

    if (item.rows[0].stock < qty) {
      return res.json({ success: false, message: "Not enough stock" });
    }

    await pool.query(
      "INSERT INTO sales (item_id, qty, date) VALUES ($1,$2,$3)",
      [item_id, qty, date]
    );

    await pool.query(
      "UPDATE items SET stock = stock - $1 WHERE id=$2",
      [qty, item_id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET SALES
router.get("/sales", async (req, res) => {
  const result = await pool.query(`
    SELECT s.id, i.item_name, s.qty, s.date, (i.price * s.qty) as total
    FROM sales s
    JOIN items i ON s.item_id = i.id
  `);
  res.json(result.rows);
});

module.exports = router;
