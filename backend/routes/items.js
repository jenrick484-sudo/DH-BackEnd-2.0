const express = require("express");
const router = express.Router();
const pool = require("../db");

/* =========================
   ADD ITEM
========================= */
router.put("/items/:id", async (req, res) => {
  const { id } = req.params;

  const {
    item_name,
    description,
    part_no,
    oem_no,
    brand,
    investment,
    price,
    stock
  } = req.body;

  try {
    await pool.query(
      `UPDATE items SET 
        item_name=$1,
        description=$2,
        part_no=$3,
        oem_no=$4,
        brand=$5,
        investment=$6,
        price=$7,
        stock=$8
       WHERE id=$9`,
      [
        item_name,
        description,
        part_no,
        oem_no,
        brand,
        investment,
        price,
        stock,
        id
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET ITEMS
========================= */
router.get("/items", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM items ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   UPDATE ITEM (EDIT)
========================= */
router.put("/items/:id", async (req, res) => {
  const { id } = req.params;
  const { item_name, investment, price, stock } = req.body;

  try {
    await pool.query(
      `UPDATE items 
       SET item_name=$1, investment=$2, price=$3, stock=$4 
       WHERE id=$5`,
      [item_name, investment, price, stock, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   DELETE ITEM
========================= */
router.delete("/items/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      "DELETE FROM items WHERE id=$1",
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
