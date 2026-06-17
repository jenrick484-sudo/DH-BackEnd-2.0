const pool = require('../config/db');

exports.getAllItems = async (req, res) => {
  const { search, sort, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  let query = `
    SELECT i.*, c.category_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (i.item_name ILIKE $${params.length} OR i.item_code ILIKE $${params.length} OR i.description ILIKE $${params.length})`;
  }

  // Sorting
  const allowedSorts = ['item_code', 'item_name', 'quantity', 'unit_price', 'created_at'];
  if (sort && allowedSorts.includes(sort)) {
    query += ` ORDER BY ${sort}`;
  } else {
    query += ` ORDER BY i.created_at DESC`;
  }

  query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  try {
    const result = await pool.query(query, params);
    const countQuery = `SELECT COUNT(*) FROM items i WHERE 1=1 ${search ? ` AND (i.item_name ILIKE $1 OR i.item_code ILIKE $1 OR i.description ILIKE $1)` : ''}`;
    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getItemById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.*, c.category_name FROM items i LEFT JOIN categories c ON i.category_id = c.id WHERE i.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createItem = async (req, res) => {
  const { item_code, item_name, category_id, description, quantity, unit_price } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      `INSERT INTO items (item_code, item_name, category_id, description, quantity, unit_price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [item_code, item_name, category_id, description, quantity, unit_price, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Item code already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateItem = async (req, res) => {
  const { id } = req.params;
  const { item_code, item_name, category_id, description, quantity, unit_price } = req.body;
  let image_url = undefined;
  if (req.file) {
    image_url = `/uploads/${req.file.filename}`;
  }

  let query = `UPDATE items SET `;
  const params = [];
  let paramCount = 0;
  const fields = { item_code, item_name, category_id, description, quantity, unit_price };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      paramCount++;
      query += `${key} = $${paramCount}, `;
      params.push(value);
    }
  }
  if (image_url) {
    paramCount++;
    query += `image_url = $${paramCount}, `;
    params.push(image_url);
  }
  // Remove trailing comma
  query = query.slice(0, -2);
  paramCount++;
  query += ` WHERE id = $${paramCount} RETURNING *`;
  params.push(id);

  try {
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Item code already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteItem = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};