const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const authRoutes = require("./routes/auth");
const itemsRoutes = require("./routes/items");
const salesRoutes = require("./routes/sales");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

app.use(cors({
  origin: "*"
}));
app.use(bodyParser.json());

app.use("/api", authRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
  res.send("Daiho Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
