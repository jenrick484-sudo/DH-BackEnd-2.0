const express = require("express");
const router = express.Router();
const pool = require("../db");

/* =========================
   ADD ITEM
========================= */
router.post("/items", async (req, res) => {

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

    // GET LAST PRODUCT NO
    const last = await pool.query(
      "SELECT product_no FROM items ORDER BY id DESC LIMIT 1"
    );

    let newNo = "000000001";

    if (last.rows.length > 0) {
      let num = parseInt(last.rows[0].product_no);
      num += 1;
      newNo = String(num).padStart(9, "0");
    }

    await pool.query(`
      INSERT INTO items (
        product_no,
        item_name,
        description,
        part_no,
        oem_no,
        brand,
        investment,
        price,
        stock
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      newNo,
      item_name,
      description,
      part_no,
      oem_no,
      brand,
      investment,
      price,
      stock
    ]);

    res.json({ success: true });

  } catch (err) {
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
