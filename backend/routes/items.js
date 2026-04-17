router.post("/items", async (req, res) => {
  const {
    item_name,
    description,
    part_no,
    oem_no,
    brand,
    investment,
    made_from
  } = req.body;

  try {
    const last = await pool.query(
      "SELECT product_no FROM items ORDER BY id DESC LIMIT 1"
    );

    let newNo = "000000001";

    if (last.rows.length > 0) {
      let num = parseInt(last.rows[0].product_no);
      num += 1;
      newNo = String(num).padStart(9, "0");
    }

    await pool.query(`
      INSERT INTO items (
        product_no, item_name, description, part_no,
        oem_no, brand, investment, made_from
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      newNo,
      item_name,
      description,
      part_no,
      oem_no,
      brand,
      investment,
      made_from
    ]);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
