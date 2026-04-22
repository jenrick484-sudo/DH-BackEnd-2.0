const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");

router.post("/upload", upload.array("images", 6), (req, res) => {

  const files = req.files.map(f => `/uploads/${f.filename}`);

  res.json({ images: files });
});

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

  const {
    item_name,
    description,
    part_no,
    oem_no,
    brand,
    investment,
    price,
    stock,
    images
  } = req.body;

  await pool.query(
    `UPDATE items SET 
      item_name=$1,
      description=$2,
      part_no=$3,
      oem_no=$4,
      brand=$5,
      investment=$6,
      price=$7,
      stock=$8,
      images=$9
     WHERE id=$10`,
    [item_name, description, part_no, oem_no, brand, investment, price, stock, images, id]
  );

  res.json({ success: true });
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
