const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(bodyParser.json());

const itemsRoutes = require("./routes/items");
const salesRoutes = require("./routes/sales");
const dashboardRoutes = require("./routes/dashboard");

app.use("/api/items", itemsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
  res.send("Daiho Backend Running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running"));
