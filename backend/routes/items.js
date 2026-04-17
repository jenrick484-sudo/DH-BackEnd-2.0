const express = require("express");
const router = express.Router();
const pool = require("../db");

// ADD ITEM
router.post("/items", async (req, res) => {
  const { item_name, investment, price, stock } = req.body;

  try {
    await pool.query(
      "INSERT INTO items (item_name, investment, price, stock) VALUES ($1,$2,$3,$4)",
      [item_name, investment, price, stock]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ITEMS (no stock)
router.get("/items", async (req, res) => {
  const result = await pool.query("SELECT id, item_name, investment, price FROM items");
  res.json(result.rows);
});

// GET ITEMS WITH STOCK (for inventory & sales)
router.get("/items/all", async (req, res) => {
  const result = await pool.query("SELECT * FROM items");
  res.json(result.rows);
});

module.exports = router;
