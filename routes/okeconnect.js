const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const upload = multer();

const db = require('../config/db');
const kirimPushNotif = require('../services/pushNotif');

const OKECONNECT_CONFIG = {
    memberId: process.env.OKECONNECT_MEMBER_ID || 'OK2385636',
    password: process.env.OKECONNECT_PASSWORD || '@noMmo123',
    pin: process.env.OKECONNECT_PIN || '1122',
    pricelistUrl: 'https://www.okeconnect.com/harga/json?id=905ccd028329b0a',
    trxUrl: 'https://h2h.okeconnect.com/trx'
};

function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('62')) clean = '0' + clean.slice(2);
    return clean;
}

function extractProducts(data) {
    if (!data) return [];
    let rawList = Array.isArray(data) ? data : (data.data || data.products || data.result || data.pricelist || []);
    return rawList.map(item => {
        const rawKategori = item.kategori || item.category || item.category_name || item.group || item.tipe || item.type || item.jenis || '';
        const rawOperator = item.operator || item.brand || item.provider || item.provider_name || '';

        let finalType = String(rawKategori).trim();
        if (!finalType || finalType.toLowerCase() === 'okeconnect') {
            finalType = rawOperator && rawOperator.toLowerCase() !== 'okeconnect' ? String(rawOperator).trim() : 'Umum';
        }
        let finalBrand = String(rawOperator).trim();
        if (!finalBrand || finalBrand.toLowerCase() === 'okeconnect') {
            finalBrand = finalType !== 'Umum' ? finalType : 'OKECONNECT';
        }

        return {
            sku: item.kode || item.code || item.sku || item.service_id || item.id_produk || item.buyer_sku_code,
            nama: item.nama || item.product_name || item.product || item.layanan || item.keterangan,
            brand: finalBrand,
            type: finalType,
            harga: parseFloat(item.harga || item.price || item.harga_modal || item.harga_h2h || 0),
            status: item.status !== undefined ? String(item.status) : '1'
        };
    }).filter(item => item.sku && String(item.sku).trim() !== '-' && String(item.sku).trim() !== '');
}

// Checkout OkeConnect (POST /api/okeconnect/checkout)
router.post('/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_hp, username, harga_jual, nama_produk, subscription_id } = req.body;
        const targetNo = customer_no || user_hp;
        const userPhone = normalizePhone(user_hp || customer_no);

        if (!buyer_sku_code || !targetNo) return res.status(400).json({ status: 'failed', message: 'Parameter SKU dan Nomor Tujuan wajib diisi.' });

        const cleanSku  = String(buyer_sku_code).trim();
        const cleanDest = String(targetNo).replace(/[^0-9]/g, '');

        if (cleanDest.length < 10 || cleanDest.length > 13) return res.status(400).json({ status: 'failed', message: 'Nomor HP tidak valid (10-13 digit).' });

        const priceVal = parseFloat(harga_jual) || 0;

        db.get("SELECT * FROM members WHERE phone = ?", [userPhone], async (err, member) => {
            if (err || !member) return res.status(404).json({ status: 'failed', message: 'Member tidak terdaftar!' });
            if (member.balance < priceVal) return res.status(400).json({ status: 'failed', message: 'Saldo member tidak mencukupi!' });

            const refId = "180774-" + Date.now();
            const memberName = username || member.name || 'Member Arcell';
            const productName = nama_produk || cleanSku;

            db.run("UPDATE members SET balance = balance - ? WHERE phone = ?", [priceVal, userPhone], async (err) => {
                if (err) return res.status(500).json({ status: 'failed', message: 'Gagal memotong saldo member' });

                const queryInsert = `INSERT INTO transactions
                    (ref_id, username, user_hp, no_tujuan, customer_no, produk, product_name, harga, price, status, subscription_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`;

                db.run(queryInsert, [refId, memberName, userPhone, cleanDest, cleanDest, productName, productName, priceVal, priceVal, subscription_id || ''], async function (err) {
                    if (err) {
                        db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                        return res.status(500).json({ status: 'failed', message: 'Gagal menyimpan transaksi ke database' });
                    }

                    try {
                        const params = new URLSearchParams({
                            memberID: OKECONNECT_CONFIG.memberId,
                            pin: OKECONNECT_CONFIG.pin,
                            password: OKECONNECT_CONFIG.password,
                            product: cleanSku,
                            dest: cleanDest,
                            refID: refId
                        });

                        const okeConnectUrl = `${OKECONNECT_CONFIG.trxUrl}?${params.toString()}`;
                        const response = await axios.get(okeConnectUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
                        const resultText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                        const resUpper = resultText.toUpperCase();

                        const isExplicitFailed = resUpper.includes("GAGAL") || resUpper.includes("SALDO TIDAK CUKUP") || resUpper.includes("SALDO KURANG");
                        const isSuccess = (resUpper.includes("PROSES") || resUpper.includes("SUKSES") || resUpper.includes("PENDING") || resUpper.includes("AKAN DIPROSES")) && !isExplicitFailed;

                        if (isSuccess) {
                            db.run("UPDATE transactions SET status = 'Proses', message = ? WHERE ref_id = ?", [resultText, refId]);
                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("Transaksi Diproses! ⚡", `Pembelian ${productName} ke ${cleanDest} sedang diproses.`, targetId, !subscription_id);
                            return res.json({ status: 'success', message: 'Transaksi Berhasil Diproses', data: { ref_id: refId, raw: resultText } });
                        } else {
                            db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                            db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [resultText, refId]);
                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("❌ Transaksi Gagal", `${productName} ke ${cleanDest} gagal: ${resultText}. Saldo dikembalikan.`, targetId, !subscription_id);
                            return res.status(400).json({ status: 'failed', message: resultText });
                        }
                    } catch (error) {
                        db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                        db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [error.message, refId]);
                        return res.status(500).json({ status: 'failed', message: 'Gagal terhubung ke OkeConnect: ' + error.message });
                    }
                });
            });
        });
    } catch (error) {
        return res.status(500).json({ status: 'failed', message: error.message });
    }
});

// Callback OkeConnect (ALL /api/okeconnect/callback ATAU via router callback di root)
router.all(['/callback', '/event'], upload.none(), async (req, res) => {
    try {
        let data = req.body;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } 
            catch (e) { data = Object.fromEntries(new URLSearchParams(data).entries()); }
        } else if (!data || Object.keys(data).length === 0) {
            data = req.query || {};
        }

        const refID = data.refid || data.ref_id || data.refID || data.trxid;
        const message = data.message || data.msg || '';
        const sn = data.sn || data.sn_response || '-';
        let rawStatus = data.status || data.st || '';
        if (!rawStatus && message) rawStatus = message;

        const statusUpper = String(rawStatus).toUpperCase();

        if (refID) {
            db.get("SELECT * FROM transactions WHERE ref_id = ?", [refID], async (err, trx) => {
                if (err || !trx) return res.status(200).send("OK");

                let finalStatus = 'Pending';
                if (statusUpper.includes('SUKSES') || statusUpper.includes('LUNAS')) finalStatus = 'Sukses';
                else if (statusUpper.includes('GAGAL') || statusUpper.includes('BATAL') || statusUpper.includes('REJECT')) finalStatus = 'Gagal';
                else if (statusUpper.includes('PROSES') || statusUpper.includes('DIPROSES')) finalStatus = 'Proses';

                const statusLamaUpper = String(trx.status).toUpperCase();
                const statusBaruUpper = finalStatus.toUpperCase();

                if (statusLamaUpper === statusBaruUpper) return res.status(200).send("OK");

                db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?", [finalStatus, (sn !== '-' ? sn : trx.sn), message, refID]);

                const userPhone = normalizePhone(trx.user_hp || trx.customer_no);
                const refundPrice = parseFloat(trx.harga || trx.price || 0);
                const targetId = trx.subscription_id || userPhone;
                const isExternalId = !trx.subscription_id;

                if (['GAGAL', 'BATAL'].includes(statusBaruUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, userPhone]);
                    await kirimPushNotif("❌ Transaksi Gagal", `${trx.product_name || 'Produk'} ke ${trx.no_tujuan} GAGAL. Saldo Rp ${refundPrice.toLocaleString('id-ID')} dikembalikan.`, targetId, isExternalId);
                } else if (['SUKSES', 'LUNAS'].includes(statusBaruUpper) && !['SUKSES', 'LUNAS'].includes(statusLamaUpper)) {
                    await kirimPushNotif("🎉 Transaksi Berhasil!", `${trx.product_name || 'Produk'} ke ${trx.no_tujuan} SUKSES. SN: ${sn}`, targetId, isExternalId);
                }
            });
        }
        return res.status(200).send("OK");
    } catch (error) {
        return res.status(200).send("OK");
    }
});

// Sync Produk OkeConnect (POST /api/okeconnect/sync)
router.post('/sync', async (req, res) => {
    try {
        const response = await axios.get(OKECONNECT_CONFIG.pricelistUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const productsList = extractProducts(response.data);

        if (!productsList || productsList.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Struktur JSON OkeConnect tidak terdeteksi atau SKU kosong.' });
        }

        let insertedCount = 0;
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`
                INSERT INTO products (buyer_sku_code, product_name, brand, type, category, price, jual, status, provider)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'okeconnect')
                ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name, brand = excluded.brand, type = excluded.type,
                    category = excluded.category, price = excluded.price, jual = excluded.jual, provider = 'okeconnect'
            `);

            productsList.forEach(item => {
                stmt.run(String(item.sku).trim(), String(item.nama).trim(), String(item.brand).trim(), String(item.type).trim(), String(item.type).trim(), item.harga, item.harga, item.status);
                insertedCount++;
            });

            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ status: 'error', message: 'Gagal Commit Database: ' + err.message });
                res.json({ status: 'success', message: `Berhasil sinkronisasi ${insertedCount} produk OkeConnect ke SQLite!`, total: insertedCount });
            });
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal terhubung ke OkeConnect: ' + err.message });
    }
});

// Cek Saldo OkeConnect (GET /api/okeconnect/saldo)
router.get('/saldo', async (req, res) => {
    try {
        const targetUrl = `${OKECONNECT_CONFIG.trxUrl}?memberID=${OKECONNECT_CONFIG.memberId}&pin=${OKECONNECT_CONFIG.pin}&password=${OKECONNECT_CONFIG.password}&act=sisa_saldo`;
        const response = await axios.get(targetUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const resText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const numbersOnly = resText.replace(/[^\d]/g, '');
        res.json({ status: 'success', balance: numbersOnly ? parseInt(numbersOnly, 10) : 0, raw: resText });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil saldo dari OkeConnect', error: err.message });
    }
});

module.exports = router;

