require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ---- MIDDLEWARE ----
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await pool.query('SELECT id, username FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) return res.sendStatus(401);
    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.sendStatus(403);
  }
}

// ---- INIT DB (kasama ang branches) ----
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      brand VARCHAR(255),
      investment DECIMAL(10,2),
      price DECIMAL(10,2) NOT NULL,
      part_number VARCHAR(100),
      oem_number VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      branches TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS item_images (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_amount DECIMAL(10,2) NOT NULL,
      created_by INTEGER REFERENCES users(id),
      sale_type VARCHAR(10) DEFAULT 'cash',
      customer_id INTEGER REFERENCES customers(id),
      created_at TIMESTAMP DEFAULT NOW(),
      payment_type VARCHAR(50)
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price DECIMAL(10,2) NOT NULL,
      line_total DECIMAL(10,2) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      company_name VARCHAR(255),
      owner VARCHAR(255),
      address TEXT,
      contact_number VARCHAR(100),
      contact_number2 VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_images (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS charges (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_amount DECIMAL(10,2) NOT NULL,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS charge_items (
      id SERIAL PRIMARY KEY,
      charge_id INTEGER REFERENCES charges(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price DECIMAL(10,2) NOT NULL,
      line_total DECIMAL(10,2) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS charge_images (
      id SERIAL PRIMARY KEY,
      charge_id INTEGER REFERENCES charges(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL
    );
  `);

  await pool.query(`ALTER TABLE charges ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50)`);
  
  // Tiyakin natin na may sub_brand / branch tracking support ang items column structures
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS branches TEXT`);
  
  console.log('All tables ready');
}
initDB();

// ---- AUTH ROUTES ----
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hashedPassword]);
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    res.status(500).json({ error: 'Username might already exist' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- ITEMS ROUTES (FIXED BRAND ALIGNMENT) ----
app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, COALESCE(inv.quantity, 0) as stock
      FROM items i LEFT JOIN inventory inv ON i.id = inv.item_id
      ORDER BY i.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.post('/api/items', authenticateToken, async (req, res) => {
  // Kunin nang maayos ang branches / sub-brand dynamic parameters mula sa client
  const { name, description, brand, investment, price, part_number, oem_number, initial_stock, images, branches } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Malinis na itatabi ang kung anong brand o variant structure ang binuo sa client payload
    const itemResult = await client.query(`
      INSERT INTO items (name, description, brand, investment, price, part_number, oem_number, branches)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [name, description, brand, investment, price, part_number, oem_number, branches || '']);
    
    const newItem = itemResult.rows[0];
    await client.query('INSERT INTO inventory (item_id, quantity) VALUES ($1, $2)', [newItem.id, initial_stock || 0]);
    
    if (images && Array.isArray(images)) {
      for (const img of images.slice(0, 6)) {
        if (img && typeof img === 'string' && img.startsWith('data:image')) {
          await client.query('INSERT INTO item_images (item_id, image_data) VALUES ($1, $2)', [newItem.id, img]);
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...newItem, stock: initial_stock || 0, images: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  } finally { client.release(); }
});

app.put('/api/items/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, brand, investment, price, part_number, oem_number, stock, images, branches } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE items SET name=$1, description=$2, brand=$3, investment=$4, price=$5, part_number=$6, oem_number=$7, branches=$8
      WHERE id=$9
    `, [name, description, brand, investment, price, part_number, oem_number, branches || '', id]);
    
    await client.query('UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE item_id = $2', [stock, id]);
    await client.query('DELETE FROM item_images WHERE item_id = $1', [id]);
    
    if (images && Array.isArray(images)) {
      for (const img of images.slice(0, 6)) {
        if (img && typeof img === 'string' && img.startsWith('data:image')) {
          await client.query('INSERT INTO item_images (item_id, image_data) VALUES ($1, $2)', [id, img]);
        }
      }
    }
    await client.query('COMMIT');
    const updated = await pool.query(`
      SELECT i.*, COALESCE(inv.quantity, 0) as stock
      FROM items i LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.id = $1
    `, [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update item' });
  } finally { client.release(); }
});

// CRITICAL FIX FOR VIEW ITEM BRAND CONFUSION
app.get('/api/items/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const itemResult = await pool.query(`
      SELECT i.*, COALESCE(inv.quantity, 0) as stock
      FROM items i LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.id = $1
    `, [id]);
    
    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item = itemResult.rows[0];
    
    const imagesResult = await pool.query('SELECT id, image_data FROM item_images WHERE item_id = $1 ORDER BY id', [id]);
    item.images = imagesResult.rows.map(r => ({ id: r.id, data: r.image_data }));
    
    // Ipadala pabalik ang item object kasama ang original saved layout elements nito nang malinis
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// ---- SUPPLIERS ----
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM suppliers ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});
app.post('/api/suppliers', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query('INSERT INTO suppliers (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Supplier might already exist' });
  }
});

// ---- INVENTORY ----
app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.id, i.name, i.description, i.brand, i.investment, i.price,
             i.part_number, i.oem_number, COALESCE(inv.quantity, 0) as stock
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      ORDER BY i.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.put('/api/inventory/:itemId', authenticateToken, async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  if (quantity == null || quantity < 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    await pool.query(
      'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
      [quantity, itemId]
    );
    res.json({ message: 'Inventory updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// ---- SALES ----
app.post('/api/sales', authenticateToken, async (req, res) => {
  const { items, sale_type, customer_id, total_amount } = req.body;
  const type = sale_type || 'cash';

  if (type === 'cash' && (!items || !Array.isArray(items) || items.length === 0)) {
    return res.status(400).json({ error: 'Items array required for cash sale' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;

    if (type === 'cash') {
      const saleItems = [];
      for (const line of items) {
        const itemRes = await client.query('SELECT * FROM items WHERE id = $1', [line.item_id]);
        if (itemRes.rows.length === 0) throw new Error(`Item ${line.item_id} not found`);
        const item = itemRes.rows[0];
        const unitPrice = line.unit_price || item.price;
        const lineTotal = unitPrice * line.quantity;
        total += lineTotal;
        saleItems.push({ item_id: item.id, quantity: line.quantity, unit_price: unitPrice, line_total: lineTotal });
        const invRes = await client.query('SELECT quantity FROM inventory WHERE item_id = $1', [item.id]);
        if (invRes.rows.length === 0 || invRes.rows[0].quantity < line.quantity) {
          throw new Error(`Insufficient stock for item "${item.name}"`);
        }
        await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE item_id = $2', [line.quantity, item.id]);
      }
      const saleResult = await client.query(
        `INSERT INTO sales (total_amount, sale_type, customer_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [total, 'cash', null, req.user.id]
      );
      const saleId = saleResult.rows[0].id;
      for (const si of saleItems) {
        await client.query(
          'INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5)',
          [saleId, si.item_id, si.quantity, si.unit_price, si.line_total]
        );
      }
    } else if (type === 'data') {
      if (!customer_id) throw new Error('Customer ID required for DATA sale');
      total = parseFloat(total_amount) || 0;
      let remaining = total;

      const unpaidCharges = await client.query(
        `SELECT id, total_amount, COALESCE(paid_amount,0) as paid_amount
         FROM charges
         WHERE customer_id = $1 AND COALESCE(paid_amount,0) < total_amount
         ORDER BY charge_date, id`,
        [customer_id]
      );

      for (const charge of unpaidCharges.rows) {
        if (remaining <= 0) break;
        const due = parseFloat(charge.total_amount) - parseFloat(charge.paid_amount);
        const toPay = Math.min(remaining, due);
        await client.query(
          'UPDATE charges SET paid_amount = COALESCE(paid_amount,0) + $1 WHERE id = $2',
          [toPay, charge.id]
        );
        remaining -= toPay;
      }

      const payment_type = req.body.payment_type || 'Cash';
      await client.query(
        `INSERT INTO sales (total_amount, sale_type, customer_id, created_by, payment_type) VALUES ($1, $2, $3, $4, $5)`,
        [total, 'data', customer_id, req.user.id, payment_type]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ sale_type: type, total_amount: total });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/sales', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.username, cust.name as customer_name,
             COALESCE(json_agg(
               json_build_object(
                 'id', si.id,
                 'item_name', i.name,
                 'quantity', si.quantity,
                 'unit_price', si.unit_price,
                 'line_total', si.line_total
               )
             ) FILTER (WHERE si.id IS NOT NULL), '[]') as line_items
      FROM sales s
      JOIN users u ON s.created_by = u.id
      LEFT JOIN customers cust ON s.customer_id = cust.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN items i ON si.item_id = i.id
      GROUP BY s.id, u.username, cust.name
      ORDER BY s.created_at DESC
    `);

    const sales = result.rows.map(sale => {
      if (sale.sale_type === 'data') {
        const total = parseFloat(sale.total_amount);
        return {
          ...sale,
          investment: total * 0.7,
          profit: total * 0.3
        };
      }
      return sale;
    });

    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

app.put('/api/sales/item/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { quantity, unit_price } = req.body;
  if (!quantity || !unit_price) return res.status(400).json({ error: 'Missing fields' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query('SELECT * FROM sale_items WHERE id = $1', [id]);
    if (old.rows.length === 0) throw new Error('Line item not found');
    const { item_id, quantity: old_qty } = old.rows[0];
    await client.query('UPDATE inventory SET quantity = quantity + $1 WHERE item_id = $2', [old_qty, item_id]);
    const inv = await client.query('SELECT quantity FROM inventory WHERE item_id = $1', [item_id]);
    if (inv.rows[0].quantity < quantity) throw new Error('Insufficient stock');
    await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE item_id = $2', [quantity, item_id]);
    const new_total = unit_price * quantity;
    await client.query('UPDATE sale_items SET quantity = $1, unit_price = $2, line_total = $3 WHERE id = $4',
      [quantity, unit_price, new_total, id]);
    const parent = await client.query('SELECT sale_id FROM sale_items WHERE id = $1', [id]);
    const saleId = parent.rows[0].sale_id;
    const sumRes = await client.query('SELECT SUM(line_total) as total FROM sale_items WHERE sale_id = $1', [saleId]);
    await client.query('UPDATE sales SET total_amount = $1 WHERE id = $2', [sumRes.rows[0].total, saleId]);
    await client.query('COMMIT');
    res.json({ message: 'Updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/sales/item/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query('SELECT * FROM sale_items WHERE id = $1', [id]);
    if (old.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Line item not found' });
    }
    const { item_id, quantity, sale_id } = old.rows[0];
    await client.query('UPDATE inventory SET quantity = quantity + $1 WHERE item_id = $2', [quantity, item_id]);
    await client.query('DELETE FROM sale_items WHERE id = $1', [id]);
    const remaining = await client.query(
      'SELECT COALESCE(SUM(line_total), 0) as total, COUNT(*) as cnt FROM sale_items WHERE sale_id = $1',
      [sale_id]
    );
    if (remaining.rows[0].cnt === 0) {
      await client.query('DELETE FROM sales WHERE id = $1', [sale_id]);
    } else {
      await client.query('UPDATE sales SET total_amount = $1 WHERE id = $2',
        [remaining.rows[0].total, sale_id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sale = await client.query('SELECT * FROM sales WHERE id = $1', [id]);
    if (sale.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }

    const { sale_type, customer_id, total_amount } = sale.rows[0];

    if (sale_type === 'cash') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot delete cash sale directly. Delete its items first.' });
    }

    if (sale_type === 'data') {
      let remaining = parseFloat(total_amount);

      const paidCharges = await client.query(
        `SELECT id, COALESCE(paid_amount, 0) as paid_amount
         FROM charges
         WHERE customer_id = $1 AND COALESCE(paid_amount, 0) > 0
         ORDER BY charge_date DESC, id DESC`,
        [customer_id]
      );

      for (const charge of paidCharges.rows) {
        if (remaining <= 0) break;
        const currentPaid = parseFloat(charge.paid_amount);
        const toRefund = Math.min(remaining, currentPaid);
        await client.query(
          'UPDATE charges SET paid_amount = paid_amount - $1 WHERE id = $2',
          [toRefund, charge.id]
        );
        remaining -= toRefund;
      }
    }

    await client.query('DELETE FROM sales WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- REPORTS ----
app.get('/api/sales/report/yearly', authenticateToken, async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: 'Year required' });
  try {
    const result = await pool.query(`
      SELECT month,
             SUM(total_sales) as total_sales,
             SUM(total_investment) as total_investment,
             SUM(total_profit) as total_profit,
             SUM(transaction_count) as transaction_count
      FROM (
        SELECT EXTRACT(MONTH FROM s.sale_date) as month,
               COALESCE(SUM(si.line_total), 0) as total_sales,
               COALESCE(SUM(i.investment * si.quantity), 0) as total_investment,
               COALESCE(SUM((si.unit_price - i.investment) * si.quantity), 0) as total_profit,
               COUNT(DISTINCT s.id) as transaction_count
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        JOIN items i ON si.item_id = i.id
        WHERE s.sale_type = 'cash' AND EXTRACT(YEAR FROM s.sale_date) = $1
        GROUP BY month
        UNION ALL
        SELECT EXTRACT(MONTH FROM s.sale_date) as month,
               SUM(s.total_amount) as total_sales,
               SUM(s.total_amount * 0.7) as total_investment,
               SUM(s.total_amount * 0.3) as total_profit,
               COUNT(s.id) as transaction_count
        FROM sales s
        WHERE s.sale_type = 'data' AND EXTRACT(YEAR FROM s.sale_date) = $1
        GROUP BY month
      ) combined
      GROUP BY month
      ORDER BY month
    `, [year]);

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const existing = result.rows.find(r => parseInt(r.month) === i + 1);
      return {
        month: i + 1,
        total_sales: existing ? parseFloat(existing.total_sales) : 0,
        total_investment: existing ? parseFloat(existing.total_investment) : 0,
        total_profit: existing ? parseFloat(existing.total_profit) : 0,
        transaction_count: existing ? parseInt(existing.transaction_count) : 0
      };
    });
    res.json(monthly);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch yearly report' });
  }
});

app.get('/api/sales/report/monthly', authenticateToken, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'Year and month required' });
  try {
    const daysInMonth = new Date(year, month, 0).getDate();
    const result = await pool.query(`
      SELECT day,
             SUM(total_sales) as total_sales,
             SUM(total_investment) as total_investment,
             SUM(total_profit) as total_profit,
             SUM(transaction_count) as transaction_count
      FROM (
        SELECT EXTRACT(DAY FROM s.sale_date) as day,
               COALESCE(SUM(si.line_total), 0) as total_sales,
               COALESCE(SUM(i.investment * si.quantity), 0) as total_investment,
               COALESCE(SUM((si.unit_price - i.investment) * si.quantity), 0) as total_profit,
               COUNT(DISTINCT s.id) as transaction_count
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        JOIN items i ON si.item_id = i.id
        WHERE s.sale_type = 'cash'
          AND EXTRACT(YEAR FROM s.sale_date) = $1
          AND EXTRACT(MONTH FROM s.sale_date) = $2
        GROUP BY day
        UNION ALL
        SELECT EXTRACT(DAY FROM s.sale_date) as day,
               SUM(s.total_amount) as total_sales,
               SUM(s.total_amount * 0.7) as total_investment,
               SUM(s.total_amount * 0.3) as total_profit,
               COUNT(s.id) as transaction_count
        FROM sales s
        WHERE s.sale_type = 'data'
          AND EXTRACT(YEAR FROM s.sale_date) = $1
          AND EXTRACT(MONTH FROM s.sale_date) = $2
        GROUP BY day
      ) combined
      GROUP BY day
      ORDER BY day
    `, [year, month]);

    const daily = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const existing = result.rows.find(r => parseInt(r.day) === day);
      return {
        day,
        total_sales: existing ? parseFloat(existing.total_sales) : 0,
        total_investment: existing ? parseFloat(existing.total_investment) : 0,
        total_profit: existing ? parseFloat(existing.total_profit) : 0,
        transaction_count: existing ? parseInt(existing.transaction_count) : 0
      };
    });
    res.json(daily);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch monthly report' });
  }
});

app.get('/api/sales/report/daily', authenticateToken, async (req, res) => {
  const { year, month, day } = req.query;
  if (!year || !month || !day) return res.status(400).json({ error: 'Year, month, day required' });
  try {
    const result = await pool.query(`
      SELECT item_name, description, brand, investment,
             quantity, unit_price, line_total, profit
      FROM (
        SELECT i.name as item_name, i.description, i.brand,
               i.investment, si.quantity, si.unit_price, si.line_total,
               (si.unit_price - i.investment) * si.quantity as profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN items i ON si.item_id = i.id
        WHERE s.sale_type = 'cash'
          AND EXTRACT(YEAR FROM s.sale_date) = $1
          AND EXTRACT(MONTH FROM s.sale_date) = $2
          AND EXTRACT(DAY FROM s.sale_date) = $3
        UNION ALL
        SELECT cust.name as item_name, NULL as description, NULL as brand,
               s.total_amount * 0.7 as investment,
               1 as quantity,
               s.total_amount as unit_price,
               s.total_amount as line_total,
               s.total_amount * 0.3 as profit
        FROM sales s
        JOIN customers cust ON s.customer_id = cust.id
        WHERE s.sale_type = 'data'
          AND EXTRACT(YEAR FROM s.sale_date) = $1
          AND EXTRACT(MONTH FROM s.sale_date) = $2
          AND EXTRACT(DAY FROM s.sale_date) = $3
      ) combined
      ORDER BY item_name
    `, [year, month, day]);

    const data = result.rows.map(row => ({
      ...row,
      investment: parseFloat(row.investment) || 0,
      unit_price: parseFloat(row.unit_price) || 0,
      line_total: parseFloat(row.line_total) || 0,
      profit: parseFloat(row.profit) || 0,
      quantity: parseInt(row.quantity) || 0
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily report' });
  }
});

// ---- CUSTOMERS ----
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.get('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const custResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (custResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = custResult.rows[0];
    const imagesResult = await pool.query('SELECT id, image_data FROM customer_images WHERE customer_id = $1 ORDER BY id', [id]);
    customer.images = imagesResult.rows.map(r => ({ id: r.id, data: r.image_data }));
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

app.post('/api/customers', authenticateToken, async (req, res) => {
  const { name, company_name, owner, address, contact_number, contact_number2, images } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO customers (name, company_name, owner, address, contact_number, contact_number2)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, company_name || '', owner || '', address || '', contact_number || '', contact_number2 || '']
    );
    const newCust = result.rows[0];
    if (images && Array.isArray(images)) {
      for (const imgBase64 of images.slice(0, 6)) {
        if (imgBase64 && typeof imgBase64 === 'string' && imgBase64.startsWith('data:image')) {
          await client.query('INSERT INTO customer_images (customer_id, image_data) VALUES ($1, $2)', [newCust.id, imgBase64]);
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json(newCust);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Customer might already exist' });
  } finally {
    client.release();
  }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, company_name, owner, address, contact_number, contact_number2, images } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE customers SET name=$1, company_name=$2, owner=$3, address=$4, contact_number=$5, contact_number2=$6
       WHERE id=$7 RETURNING *`,
      [name, company_name, owner, address, contact_number, contact_number2, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    await client.query('DELETE FROM customer_images WHERE customer_id = $1', [id]);
    if (images && Array.isArray(images)) {
      for (const imgBase64 of images.slice(0, 6)) {
        if (imgBase64 && typeof imgBase64 === 'string' && imgBase64.startsWith('data:image')) {
          await client.query('INSERT INTO customer_images (customer_id, image_data) VALUES ($1, $2)', [id, imgBase64]);
        }
      }
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update customer' });
  } finally {
    client.release();
  }
});

// ---- CHARGES ----
app.post('/api/charges', authenticateToken, async (req, res) => {
  const { customer_id, items } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'Customer ID required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    const chargeItems = [];
    for (const line of items) {
      const itemRes = await client.query('SELECT * FROM items WHERE id = $1', [line.item_id]);
      if (itemRes.rows.length === 0) throw new Error(`Item ${line.item_id} not found`);
      const item = itemRes.rows[0];
      const unitPrice = line.unit_price || item.price;
      const lineTotal = unitPrice * line.quantity;
      total += lineTotal;
      chargeItems.push({ item_id: item.id, quantity: line.quantity, unit_price: unitPrice, line_total: lineTotal });
      const invRes = await client.query('SELECT quantity FROM inventory WHERE item_id = $1', [item.id]);
      if (invRes.rows.length === 0 || invRes.rows[0].quantity < line.quantity) {
        throw new Error(`Insufficient stock for item "${item.name}"`);
      }
      await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE item_id = $2', [line.quantity, item.id]);
    }
    const chargeResult = await client.query(
      'INSERT INTO charges (customer_id, total_amount, paid_amount, created_by) VALUES ($1, $2, 0, $3) RETURNING id',
      [customer_id, total, req.user.id]
    );
    const chargeId = chargeResult.rows[0].id;
    for (const ci of chargeItems) {
      if (req.body.images && Array.isArray(req.body.images)) {
        for (const imgBase64 of req.body.images.slice(0, 6)) {
          if (imgBase64 && typeof imgBase64 === 'string' && imgBase64.startsWith('data:image')) {
            await client.query('INSERT INTO charge_images (charge_id, image_data) VALUES ($1, $2)', [chargeId, imgBase64]);
          }
        }
      }
      await client.query(
        'INSERT INTO charge_items (charge_id, item_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5)',
        [chargeId, ci.item_id, ci.quantity, ci.unit_price, ci.line_total]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ charge_id: chargeId, total_amount: total });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/charges/:id/images', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, image_data FROM charge_images WHERE charge_id = $1 ORDER BY id',
      [id]
    );
    res.json(result.rows.map(r => ({ id: r.id, data: r.image_data })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch charge images' });
  }
});

app.get('/api/charges/customer-summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cust.id as customer_id, cust.name as customer_name, cust.owner,
          COUNT(DISTINCT c.id) as charge_count,
          COALESCE(SUM(c.total_amount - COALESCE(c.paid_amount,0)), 0) as total_amount
      FROM customers cust
      LEFT JOIN charges c ON cust.id = c.customer_id
      GROUP BY cust.id, cust.name, cust.owner
      ORDER BY cust.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer summary' });
  }
});

app.get('/api/charges/by-customer', authenticateToken, async (req, res) => {
  const { customer_id } = req.query;
  if (!customer_id) return res.status(400).json({ error: 'Customer ID required' });
  try {
    const result = await pool.query(`
      SELECT c.id, c.charge_date, c.created_at, c.total_amount,
             COALESCE(c.paid_amount, 0) as paid_amount,
             COUNT(ci.id) as item_count,
             c.total_amount - COALESCE(c.paid_amount, 0) as outstanding
      FROM charges c
      LEFT JOIN charge_items ci ON c.id = ci.charge_id
      WHERE c.customer_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `, [customer_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch charges' });
  }
});

app.get('/api/charges/items', authenticateToken, async (req, res) => {
  const { charge_id } = req.query;
  if (!charge_id) return res.status(400).json({ error: 'Charge ID required' });
  try {
    const result = await pool.query(`
      SELECT i.name as item_name, i.description, i.brand, i.investment,
             ci.quantity, ci.unit_price, ci.line_total,
             (ci.unit_price - i.investment) * ci.quantity as profit
      FROM charge_items ci
      JOIN items i ON ci.item_id = i.id
      WHERE ci.charge_id = $1
      ORDER BY ci.id
    `, [charge_id]);
    const data = result.rows.map(row => ({
      ...row,
      investment: parseFloat(row.investment) || 0,
      unit_price: parseFloat(row.unit_price) || 0,
      line_total: parseFloat(row.line_total) || 0,
      profit: parseFloat(row.profit) || 0,
      quantity: parseInt(row.quantity) || 0
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch charge items' });
  }
});

app.get('/api/charges/totals', authenticateToken, async (req, res) => {
  const { customer_id, charge_id } = req.query;
  try {
    let query = `
      SELECT
        COALESCE(SUM(c.total_amount - COALESCE(c.paid_amount, 0)), 0) as overall_outstanding
      FROM charges c
      WHERE 1=1
    `;
    const params = [];
    if (customer_id) {
      params.push(customer_id);
      query += ` AND c.customer_id = $${params.length}`;
    }
    if (charge_id) {
      params.push(charge_id);
      query += ` AND c.id = $${params.length}`;
    }

    const result = await pool.query(query, params);
    const outstanding = parseFloat(result.rows[0].overall_outstanding);
    const overall_total = outstanding;
    const overall_investment = overall_total * 0.7;
    const overall_profit = overall_total * 0.3;
    res.json({ overall_total, overall_investment, overall_profit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch totals' });
  }
});

app.get('/api/customers/:id/transactions', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        t.date,
        t.type,
        t.amount,
        SUM(t.signed_amount) OVER (ORDER BY t.date, t.seq, t.item_id) as balance
      FROM (
        SELECT charge_date as date, 'CH' as type, total_amount as amount,
               total_amount as signed_amount, 1 as seq, id as item_id
        FROM charges
        WHERE customer_id = $1
        UNION ALL
        SELECT sale_date as date,
               'DT, ' || COALESCE(s.payment_type, 'Cash') as type,
               s.total_amount as amount,
               -s.total_amount as signed_amount,
               2 as seq,
               s.id as item_id
        FROM sales s
        WHERE s.customer_id = $1 AND s.sale_type = 'data'
      ) t
      ORDER BY t.date, t.seq, t.item_id
    `, [id]);

    const transactions = result.rows.map(row => ({
      date: row.date,
      type: row.type,
      amount: parseFloat(row.amount),
      balance: parseFloat(row.balance)
    }));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const salesToday = await pool.query('SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE sale_date = $1', [today]);
    const itemCount = await pool.query('SELECT COUNT(*) as count FROM items');
    const inventoryValue = await pool.query(`
      SELECT COALESCE(SUM(i.price * inv.quantity), 0) as value
      FROM inventory inv
      JOIN items i ON inv.item_id = i.id
    `);
    res.json({
      today_sales: parseFloat(salesToday.rows[0].total),
      total_items: parseInt(itemCount.rows[0].count),
      inventory_value: parseFloat(inventoryValue.rows[0].value)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
