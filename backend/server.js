const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/api", authRoutes);

app.get("/", (req, res) => {
  res.send("Daiho Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

//ADD ITEM
app.post("/items", async (req, res) => {
  const { item_name, price, investment, stock } = req.body;

  await pool.query(
    "INSERT INTO items (item_name, price, investment, stock) VALUES ($1,$2,$3,$4)",
    [item_name, price, investment, stock]
  );

  const result = await pool.query("SELECT * FROM items ORDER BY id DESC");
  res.json(result.rows);
});

//GET ITEMS
app.get("/items", async (req, res) => {
  const result = await pool.query("SELECT * FROM items ORDER BY id DESC");
  res.json(result.rows);
});

//ADD SALE (AUTO COMPUTE + STOCK UPDATE)
app.post("/sales", async (req, res) => {
  const { item_id, quantity, sale_date } = req.body;

  const itemRes = await pool.query(
    "SELECT * FROM items WHERE id=$1",
    [item_id]
  );

  const item = itemRes.rows[0];

  if (!item || item.stock < quantity) {
    return res.json({ success: false, message: "Invalid stock" });
  }

  const sale_amount = item.price * quantity;
  const investment_amount = item.investment * quantity;
  const profit = sale_amount - investment_amount;

  await pool.query(
    "INSERT INTO sales (item_id, quantity, sale_amount, investment_amount, profit, sale_date) VALUES ($1,$2,$3,$4,$5,$6)",
    [item_id, quantity, sale_amount, investment_amount, profit, sale_date]
  );

  await pool.query(
    "UPDATE items SET stock = stock - $1 WHERE id=$2",
    [quantity, item_id]
  );

  res.json({ success: true, sale_amount, investment_amount, profit });
});

//GET SALES
app.get("/sales", async (req, res) => {
  const result = await pool.query(`
    SELECT sales.*, items.item_name
    FROM sales
    JOIN items ON items.id = sales.item_id
    ORDER BY sales.id DESC
  `);

  res.json(result.rows);
});

//DASHBOARD TOTALS
app.get("/dashboard", async (req, res) => {
  const sales = await pool.query("SELECT SUM(sale_amount) FROM sales");
  const investment = await pool.query("SELECT SUM(investment_amount) FROM sales");
  const profit = await pool.query("SELECT SUM(profit) FROM sales");

  res.json({
    sales: sales.rows[0].sum || 0,
    investment: investment.rows[0].sum || 0,
    profit: profit.rows[0].sum || 0
  });
});
