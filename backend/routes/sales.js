const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ADD SALE */
router.post("/", async (req, res) => {
  const { item_id, quantity, sale_date } = req.body;

  const itemRes = await pool.query("SELECT * FROM items WHERE id=$1", [item_id]);
  const item = itemRes.rows[0];

  const sale_amount = item.price * quantity;
  const investment_amount = item.investment * quantity;
  const profit = sale_amount - investment_amount;

  await pool.query(
    `INSERT INTO sales (item_id, quantity, sale_amount, investment_amount, profit, sale_date)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [item_id, quantity, sale_amount, investment_amount, profit, sale_date]
  );

  await pool.query("UPDATE items SET stock = stock - $1 WHERE id=$2", [quantity, item_id]);

  res.json({ profit });
});

/* GET SALES */
router.get("/", async (req, res) => {
  const result = await pool.query(`
    SELECT sales.*, items.item_name
    FROM sales
    JOIN items ON items.id = sales.item_id
    ORDER BY sales.id DESC
  `);

  res.json(result.rows);
});

module.exports = router;