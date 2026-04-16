const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ADD ITEM */
router.post("/", async (req, res) => {
  const { item_name, price, investment, stock } = req.body;

  await pool.query(
    "INSERT INTO items (item_name, price, investment, stock) VALUES ($1,$2,$3,$4)",
    [item_name, price, investment, stock]
  );

  res.json({ success: true });
});

/* GET ITEMS */
router.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM items ORDER BY id DESC");
  res.json(result.rows);
});

module.exports = router;