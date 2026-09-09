const express = require('express');
const router = express.Router();
const db = require('../config/db');

function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('62')) clean = '0' + clean.slice(2);
    return clean;
}

// GET /api/products
router.get('/products', (req, res) => {
    const query = `SELECT * FROM products WHERE provider = 'digiflazz' OR provider IS NULL OR provider = ''`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

// GET /api/products/okeconnect
router.get('/products/okeconnect', (req, res) => {
    const query = `
        SELECT buyer_sku_code, buyer_sku_code AS code, buyer_sku_code AS sku, buyer_sku_code AS kode,
               product_name, brand, type, type AS kategori, price, jual, status, provider
        FROM products WHERE provider = 'okeconnect'
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

// POST /api/member/login
router.post('/member/login', (req, res) => {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'Nomor HP wajib diisi!' });
    const cleanPhone = normalizePhone(phone);

    db.get("SELECT * FROM members WHERE phone = ?", [cleanPhone], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal memproses login' });
        if (!row) {
            const memberId = 'ARC-' + Date.now().toString().slice(-6);
            const memberName = name || 'Member-' + cleanPhone.slice(-4);
            db.run("INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, 0)", [memberId, memberName, cleanPhone], function (err) {
                if (err) return res.status(500).json({ status: 'error', message: 'Gagal buat akun' });
                res.json({ status: 'success', message: 'Login berhasil', data: { member_id: memberId, name: memberName, phone: cleanPhone, balance: 0, status: 'aktif' } });
            });
        } else {
            if (name && row.name !== name) {
                db.run("UPDATE members SET name = ? WHERE phone = ?", [name, cleanPhone]);
                row.name = name;
            }
            res.json({ status: 'success', message: 'Login berhasil', data: row });
        }
    });
});

// GET /api/history
router.get('/history', (req, res) => {
    const rawPhone = req.query.phone || req.query.hp || '';
    const phone = normalizePhone(rawPhone);

    if (!phone) return res.json({ status: 'success', data: [] });

    const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
    const sql = `SELECT * FROM transactions WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ? ORDER BY id DESC`;

    db.all(sql, [phone, altPhone, phone, altPhone], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows || [] });
    });
});

// GET /api/transaction/detail
router.get('/transaction/detail', (req, res) => {
    const trxId = (req.query.id || '').trim();
    if (!trxId) return res.status(400).json({ status: 'error', message: 'ID Transaksi kosong' });

    const sql = `SELECT * FROM transactions WHERE ref_id = ? OR id = ? OR no_tujuan = ? OR customer_no = ? LIMIT 1`;
    db.get(sql, [trxId, trxId, trxId, trxId], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal query database' });
        if (!row) return res.status(404).json({ status: 'error', message: 'Data transaksi tidak ditemukan' });
        res.json({ status: 'success', data: row });
    });
});

// GET /api/user/products-by-prefix
router.get('/user/products-by-prefix', (req, res) => {
    const { brand } = req.query;
    if (!brand) return res.json({ status: 'success', data: {} });

    const sql = `
        SELECT cc.name as category_name, cp.provider, p.buyer_sku_code, p.product_name, p.jual, p.price, p.status
        FROM custom_categories cc
        JOIN category_products cp ON cc.id = cp.category_id
        JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND cp.provider = p.provider
        WHERE UPPER(cc.brand) = UPPER(?) AND p.status = '1'
        ORDER BY cc.sort_order ASC, p.jual ASC
    `;

    db.all(sql, [brand], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.category_name]) grouped[row.category_name] = [];
            grouped[row.category_name].push({
                buyer_sku_code: row.buyer_sku_code,
                product_name: row.product_name,
                price: row.jual || row.price,
                _provider: row.provider
            });
        });
        res.json({ status: 'success', data: grouped });
    });
});

module.exports = router;

