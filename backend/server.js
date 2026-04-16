const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const pool = require("./db");

const app = express();

app.use(cors({
    origin: "*"
}));

app.use(express.json());

// REGISTER
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (username, password) VALUES ($1, $2)",
            [username, hashedPassword]
        );

        res.json({ message: "User created" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await pool.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ message: "User not found" });
        }

        const valid = await bcrypt.compare(
            password,
            user.rows[0].password
        );

        if (!valid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        res.json({ message: "Login successful" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/", (req, res) => res.send("Sales backend OK"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
