const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/dashboard", async (req, res) => {
  try {
    const sales = await pool.query(`
      SELECT SUM(i.price * s.qty) as total_sales,
             SUM((i.price - i.investment) * s.qty) as total_profit
      FROM sales s
      JOIN items i ON s.item_id = i.id
    `);

    const investment = await pool.query(`
      SELECT SUM(investment * stock) as total_investment FROM items
    `);

    res.json({
      total_sales: sales.rows[0].total_sales || 0,
      total_profit: sales.rows[0].total_profit || 0,
      total_investment: investment.rows[0].total_investment || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
