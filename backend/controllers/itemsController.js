const pool = require('../config/db');

exports.getAllItems = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.*, c.category_name 
            FROM items i 
            LEFT JOIN categories c ON i.category_id = c.id 
            ORDER BY i.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getItemById = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createItem = async (req, res) => {
    const { item_code, item_name, category_id, description, quantity, unit_price, image_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO items (item_code, item_name, category_id, description, quantity, unit_price, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [item_code, item_name, category_id, description, quantity, unit_price, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateItem = async (req, res) => {
    const { id } = req.params;
    const { item_code, item_name, category_id, description, quantity, unit_price, image_url } = req.body;
    try {
        const result = await pool.query(
            'UPDATE items SET item_code=$1, item_name=$2, category_id=$3, description=$4, quantity=$5, unit_price=$6, image_url=$7 WHERE id=$8 RETURNING *',
            [item_code, item_name, category_id, description, quantity, unit_price, image_url, id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteItem = async (req, res) => {
    try {
        await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
        res.json({ message: 'Item deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};