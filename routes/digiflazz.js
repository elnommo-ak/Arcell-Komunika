const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

const db = require('../config/db');
const kirimPushNotif = require('../services/pushNotif');

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

// Checkout Digiflazz (POST /api/digiflazz/checkout)
router.post('/checkout', async (req, res) => {
    const { buyer_sku_code, customer_no, user_hp, username, harga_jual, nama_produk, subscription_id } = req.body;
    const targetNo = customer_no || user_hp;
    const userPhone = normalizePhone(user_hp || customer_no);

    if (!buyer_sku_code || !targetNo) return res.status(400).json({ status: 'error', message: 'SKU dan No Tujuan wajib diisi!' });

    const priceVal = parseFloat(harga_jual) || 0;

    db.get("SELECT * FROM members WHERE phone = ?", [userPhone], async (err, member) => {
        if (err || !member) return res.status(404).json({ status: 'error', message: 'Member tidak terdaftar!' });
        if (member.balance < priceVal) return res.status(400).json({ status: 'error', message: 'Saldo member tidak mencukupi!' });

        const refId = 'TRX_' + Date.now();
        const memberName = username || member.name || 'Member Arcell';
        const productName = nama_produk || buyer_sku_code;

        db.run("UPDATE members SET balance = balance - ? WHERE phone = ?", [priceVal, userPhone], (err) => {
            if (err) return res.status(500).json({ status: 'error', message: 'Gagal potong saldo' });

            const queryInsert = `INSERT INTO transactions
                (ref_id, username, user_hp, no_tujuan, customer_no, produk, product_name, harga, price, status, subscription_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`;

            db.run(queryInsert, [refId, memberName, userPhone, targetNo, targetNo, productName, productName, priceVal, priceVal, subscription_id || ''], async function (err) {
                if (err) {
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                    return res.status(500).json({ status: 'error', message: 'Gagal simpan transaksi' });
                }

                try {
                    const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + refId);
                    const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                    const callbackUrl = `${BASE_URL}/api/digiflazz/webhook`;

                    const digiRes = await axios.post('https://api.digiflazz.com/v1/transaction', {
                        username: USERNAME_DIGI,
                        buyer_sku_code: buyer_sku_code,
                        customer_no: targetNo,
                        ref_id: refId,
                        sign: sign,
                        cb_url: callbackUrl
                    });

                    const dataRes = digiRes.data?.data;
                    const finalStatus = dataRes?.status || 'Pending';

                    db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?", [finalStatus, dataRes?.sn || '', dataRes?.message || '', refId]);

                    if (String(finalStatus).toLowerCase() === 'gagal') {
                        db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                        const targetId = subscription_id || userPhone;
                        await kirimPushNotif("❌ Transaksi Gagal", `${productName} ke ${targetNo} gagal: ${dataRes?.message || 'Error'}`, targetId, !subscription_id);
                    } else {
                        const targetId = subscription_id || userPhone;
                        await kirimPushNotif("Transaksi Diproses! 🛍️", `Pembelian ${productName} senilai Rp ${priceVal.toLocaleString('id-ID')} ke ${targetNo} sedang diproses.`, targetId, !subscription_id);
                    }

                    res.json({ status: 'success', message: 'Transaksi berhasil diproses', ref_id: refId, data: dataRes });
                } catch (apiErr) {
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                    db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [apiErr.response?.data?.data?.message || 'Error Provider', refId]);
                    res.status(500).json({ status: 'error', message: 'Gagal ke provider' });
                }
            });
        });
    });
});

// Webhook Digiflazz (POST /api/digiflazz/webhook)
router.post('/webhook', (req, res) => {
    try {
        const bodyData = req.body.data || req.body;
        const { ref_id, status, sn, message } = bodyData;

        if (ref_id) {
            db.get("SELECT * FROM transactions WHERE ref_id = ?", [ref_id], async (err, trx) => {
                if (err || !trx) return;

                const statusClean = status || 'Gagal';
                const cleanSn = (sn && sn !== '-') ? sn : (trx.sn || '');
                const statusUpper = String(statusClean).toUpperCase();
                const statusLamaUpper = String(trx.status).toUpperCase();

                if (statusLamaUpper === statusUpper) return;

                db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?", [statusClean, cleanSn, message || '', ref_id]);

                if (['GAGAL', 'BATAL'].includes(statusUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
                    const targetHp = normalizePhone(trx.user_hp || trx.customer_no);
                    const refundPrice = trx.harga || trx.price || 0;
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, targetHp]);
                }

                const namaProduk = trx.produk || trx.product_name || 'Produk PPOB';
                const noTujuan = trx.no_tujuan || trx.customer_no || '';
                const targetId = trx.subscription_id || trx.user_hp;
                const isExternalId = !trx.subscription_id; 

                if (targetId) {
                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        await kirimPushNotif("🎉 Transaksi Berhasil!", `${namaProduk} (${noTujuan}) SUKSES. SN: ${cleanSn}`, targetId, isExternalId);
                    } else if (['GAGAL', 'BATAL'].includes(statusUpper)) {
                        await kirimPushNotif("❌ Transaksi Gagal", `${namaProduk} (${noTujuan}) Gagal: ${message || 'Gagal diproses'}. Saldo dikembalikan.`, targetId, isExternalId);
                    }
                }
            });
        }
        res.status(200).json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ status: 'error' });
    }
});

// Sync Pricelist Digiflazz (POST /api/digiflazz/price-list)
router.post('/price-list', async (req, res) => {
    try {
        const username = USERNAME_DIGI.trim();
        const apiKey = API_KEY_DIGI.trim();

        if (!username || !apiKey) return res.status(400).json({ status: 'error', message: 'Kredensial Digiflazz di .env belum diisi!' });

        const sign = generateMD5(username + apiKey + "pricelist");
        const response = await axios.post('https://api.digiflazz.com/v1/price-list', { cmd: 'prepaid', username, sign }, { timeout: 20000 });

        let products = response.data?.data || [];

        if (products.length > 0) {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare(`
                    INSERT INTO products (buyer_sku_code, product_name, brand, type, category, price, jual, provider) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'digiflazz')
                    ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name, brand = excluded.brand, type = excluded.type,
                    category = excluded.category, price = excluded.price, jual = excluded.jual, provider = 'digiflazz'
                `);

                products.forEach(p => {
                    const sku = p.buyer_sku_code;
                    const name = p.product_name;
                    const brand = (p.brand || 'UMUM').toUpperCase();
                    const category = p.category || 'Umum';
                    const modalPrice = parseFloat(p.price || 0);

                    if (sku && name) stmt.run(sku, name, brand, category, category, modalPrice, modalPrice);
                });

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ status: 'error', message: 'Gagal simpan ke DB' });
                    res.json({ status: 'success', message: `${products.length} produk berhasil di-sync ke SQLite`, total: products.length });
                });
            });
        } else {
            res.json({ status: 'success', message: 'Tidak ada produk dari Digiflazz', total: 0 });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

module.exports = router;

