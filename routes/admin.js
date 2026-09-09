const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

const db = require('../config/db');

const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';

function generateMD5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('62')) clean = '0' + clean.slice(2);
    return clean;
}

// GET /api/saldo
router.get('/saldo', async (req, res) => {
    try {
        if (!USERNAME_DIGI || !API_KEY_DIGI) return res.json({ deposit: 0 });
        const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + 'depo');
        const response = await axios.post('https://api.digiflazz.com/v1/cek-saldo', { cmd: 'deposit', username: USERNAME_DIGI, sign });
        res.json({ status: 'success', deposit: response.data?.data?.deposit || 0 });
    } catch (err) {
        res.json({ status: 'error', deposit: 0 });
    }
});

// Manajemen Produk Digiflazz Admin
router.post('/admin/products', (req, res) => {
    const { buyer_sku_code, product_name, brand, type, price, jual, status } = req.body;
    if (!buyer_sku_code || !product_name) return res.status(400).json({ status: 'error', message: 'SKU Wajib' });

    const priceVal = parseFloat(price || jual || 0);
    const jualVal = parseFloat(jual || price || 0);
    const statusVal = status !== undefined ? String(status) : '1';

    const query = `INSERT INTO products (buyer_sku_code, product_name, brand, type, category, price, jual, status, provider) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'digiflazz')
                   ON CONFLICT(buyer_sku_code) DO UPDATE SET
                   product_name = excluded.product_name, brand = excluded.brand, type = excluded.type,
                   category = excluded.category, price = excluded.price, jual = excluded.jual, status = excluded.status`;

    db.run(query, [buyer_sku_code, product_name, brand, type || 'Umum', type || 'Umum', priceVal, jualVal, statusVal], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk disimpan' });
    });
});

router.post('/admin/products/status', (req, res) => {
    const { sku, status } = req.body;
    if (!sku) return res.status(400).json({ status: 'error', message: 'SKU Wajib' });
    db.run(`UPDATE products SET status = ? WHERE buyer_sku_code = ?`, [String(status), sku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Status produk berhasil diperbarui' });
    });
});

router.delete('/admin/products/:sku', (req, res) => {
    db.run("DELETE FROM products WHERE buyer_sku_code = ?", [req.params.sku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk dihapus' });
    });
});

// Manajemen Produk OkeConnect Admin
router.post('/admin/products/okeconnect/status', (req, res) => {
    const { code, sku, status } = req.body;
    const kodeSku = code || sku;
    if (!kodeSku) return res.status(400).json({ status: 'error', message: 'Kode SKU Wajib' });
    db.run(`UPDATE products SET status = ? WHERE buyer_sku_code = ? AND provider = 'okeconnect'`, [String(status), kodeSku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Status produk Okeconnect diperbarui' });
    });
});

router.delete('/admin/products/okeconnect/:code', (req, res) => {
    db.run("DELETE FROM products WHERE buyer_sku_code = ? AND provider = 'okeconnect'", [req.params.code], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk Okeconnect dihapus' });
    });
});

// Manajemen Members
router.get('/admin/members', (req, res) => {
    db.all("SELECT * FROM members ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

router.post('/admin/members', (req, res) => {
    const { name, phone, balance } = req.body;
    if (!name || !phone) return res.status(400).json({ status: 'error', message: 'Nama & No HP Wajib' });

    const memberId = 'MEM-' + Date.now().toString().slice(-5);
    db.run("INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, ?)", [memberId, name, normalizePhone(phone), parseFloat(balance) || 0], function(err) {
        if (err) return res.status(400).json({ status: 'error', message: 'Nomor HP sudah terdaftar' });
        res.json({ status: 'success', message: 'Member berhasil ditambahkan' });
    });
});

router.delete('/admin/members/:phone', (req, res) => {
    const cleanPhone = normalizePhone(req.params.phone);
    db.run("DELETE FROM members WHERE phone = ? OR member_id = ?", [cleanPhone, req.params.phone], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal menghapus member' });
        res.json({ status: 'success', message: 'Member berhasil dihapus' });
    });
});

router.post('/admin/update-user-balance', (req, res) => {
    const { phone, action, amount } = req.body;
    const cleanPhone = normalizePhone(phone);
    const numAmount = parseFloat(amount) || 0;

    db.get("SELECT name, balance FROM members WHERE phone = ?", [cleanPhone], (err, row) => {
        if (err || !row) return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan' });

        let newBalance = action === 'tambah' ? row.balance + numAmount : Math.max(0, row.balance - numAmount);
        db.run("UPDATE members SET balance = ? WHERE phone = ?", [newBalance, cleanPhone], (err) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', message: `Saldo ${row.name} diperbarui` });
        });
    });
});

// Transaksi Admin
router.get('/admin/transactions', (req, res) => {
    const phone = req.query.phone ? normalizePhone(req.query.phone) : null;
    let sql = "SELECT * FROM transactions ORDER BY id DESC";
    let params = [];

    if (phone) {
        const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
        sql = `SELECT * FROM transactions WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ? ORDER BY id DESC`;
        params = [phone, altPhone, phone, altPhone];
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        const normalizedRows = rows.map(row => ({ ...row, user_hp: normalizePhone(row.user_hp || row.customer_no) }));
        res.json(normalizedRows);
    });
});

// Custom Categories
router.get('/admin/custom-categories', (req, res) => {
    db.all(`SELECT * FROM custom_categories ORDER BY sort_order ASC, id DESC`, [], (err, categories) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        db.all(`
            SELECT cp.category_id, cp.buyer_sku_code, cp.provider, p.product_name, p.jual, p.price 
            FROM category_products cp
            JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND cp.provider = p.provider
        `, [], (err2, products) => {
            if (err2) return res.status(500).json({ status: 'error', message: err2.message });

            const result = categories.map(cat => ({ ...cat, products: products.filter(p => p.category_id === cat.id) }));
            res.json({ status: 'success', data: result });
        });
    });
});

router.post('/admin/custom-categories', (req, res) => {
    const { name, brand } = req.body;
    db.run(`INSERT INTO custom_categories (name, brand) VALUES (?, ?)`, [name, brand], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', id: this.lastID });
    });
});

router.delete('/admin/custom-categories/:id', (req, res) => {
    db.run(`DELETE FROM custom_categories WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

router.post('/admin/map-category-product-bulk', (req, res) => {
    const { category_id, skus, provider } = req.body;
    if (!skus || skus.length === 0) return res.json({ status: 'success' });

    const stmt = db.prepare(`INSERT OR IGNORE INTO category_products (category_id, buyer_sku_code, provider) VALUES (?, ?, ?)`);
    skus.forEach(sku => stmt.run(category_id, sku, provider));
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

router.post('/admin/unmap-category-product', (req, res) => {
    const { category_id, buyer_sku_code, provider } = req.body;
    db.run(`DELETE FROM category_products WHERE category_id = ? AND buyer_sku_code = ? AND provider = ?`, [category_id, buyer_sku_code, provider], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

router.post('/admin/update-custom-product', (req, res) => {
    const { buyer_sku_code, product_name, price, provider } = req.body;
    if (!buyer_sku_code || !product_name || price === undefined) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

    const priceVal = parseFloat(price) || 0;
    const cleanProvider = (provider || 'digiflazz').toLowerCase();

    const queryMaster = `UPDATE products SET product_name = ?, price = ?, jual = ? WHERE buyer_sku_code = ? AND LOWER(provider) = ?`;
    db.run(queryMaster, [product_name, priceVal, priceVal, buyer_sku_code, cleanProvider], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (this.changes > 0) return res.json({ status: 'success', message: 'Produk berhasil diperbarui!' });

        const queryFallback = `UPDATE products SET product_name = ?, price = ?, jual = ? WHERE buyer_sku_code = ?`;
        db.run(queryFallback, [product_name, priceVal, priceVal, buyer_sku_code], function(err2) {
            if (err2) return res.status(500).json({ status: 'error', message: err2.message });
            return res.json({ status: 'success', message: 'Produk berhasil diperbarui!' });
        });
    });
});

module.exports = router;

