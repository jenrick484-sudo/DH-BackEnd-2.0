const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const pool = require("./db");

const app = express();

app.use(cors({
    origin: "*"
}));
app.use(express.json());

// REGISTER USER (for setup)
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
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

        const validPassword = await bcrypt.compare(
            password,
            user.rows[0].password
        );

        if (!validPassword) {
            return res.status(400).json({ message: "Invalid password" });
        }

        res.json({ message: "Login successful" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});