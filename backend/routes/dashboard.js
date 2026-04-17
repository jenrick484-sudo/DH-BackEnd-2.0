const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/dashboard", async (req, res) => {
  try {
    const sales = await pool.query(`
      SELECT 
        COALESCE(SUM(i.price * s.qty), 0) AS total_sales,
        COALESCE(SUM((i.price - i.investment) * s.qty), 0) AS total_profit
      FROM sales s
      JOIN items i ON s.item_id = i.id
    `);

    const investment = await pool.query(`
      SELECT COALESCE(SUM(investment * stock), 0) AS total_investment 
      FROM items
    `);

    res.json({
      total_sales: Number(sales.rows[0].total_sales),
      total_profit: Number(sales.rows[0].total_profit),
      total_investment: Number(investment.rows[0].total_investment)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
