const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const sales = await pool.query("SELECT SUM(sale_amount) FROM sales");
  const investment = await pool.query("SELECT SUM(investment_amount) FROM sales");
  const profit = await pool.query("SELECT SUM(profit) FROM sales");

  res.json({
    sales: sales.rows[0].sum || 0,
    investment: investment.rows[0].sum || 0,
    profit: profit.rows[0].sum || 0
  });
});

module.exports = router;