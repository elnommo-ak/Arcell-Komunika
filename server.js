require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer();

// ==================== CONFIGURATION ====================
const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

const OKECONNECT_CONFIG = {
    memberId: process.env.OKECONNECT_MEMBER_ID || 'OK2385636',
    password: process.env.OKECONNECT_PASSWORD || '@noMmo123',
    pin: process.env.OKECONNECT_PIN || '1122',
    pricelistUrl: 'https://www.okeconnect.com/harga/json?id=905ccd028329b0a',
    trxUrl: 'https://h2h.okeconnect.com/trx'
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper Utility
function generateMD5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('62')) {
        clean = '0' + clean.slice(2);
    }
    return clean;
}

// ==================== DATABASE INITIALIZATION ====================
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Error DB:', err.message);
    else {
        console.log('⚡ Connected to SQLite Database');
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if (pragmaErr) console.error("Error Pragma FK:", pragmaErr.message);
            else console.log("🔗 Foreign Keys Support: ENABLED");
            initTables();
        });
    }
});

function initTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id TEXT UNIQUE,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            balance REAL DEFAULT 0,
            status TEXT DEFAULT 'aktif',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ref_id TEXT UNIQUE,
            username TEXT,
            user_hp TEXT,
            no_tujuan TEXT,
            customer_no TEXT,
            produk TEXT,
            product_name TEXT,
            harga REAL,
            price REAL,
            status TEXT DEFAULT 'Pending',
            sn TEXT DEFAULT '',
            message TEXT DEFAULT '',
            nomor_pembayaran TEXT,
            subscription_id TEXT,
            waktu DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_hp) REFERENCES members(phone) ON DELETE CASCADE ON UPDATE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
            buyer_sku_code TEXT PRIMARY KEY,
            product_name TEXT,
            brand TEXT,
            type TEXT DEFAULT 'Umum',
            category TEXT DEFAULT 'Umum',
            price REAL,
            jual REAL,
            status TEXT DEFAULT '1',
            provider TEXT DEFAULT 'digiflazz'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS custom_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            brand TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS category_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            buyer_sku_code TEXT NOT NULL,
            provider TEXT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES custom_categories(id) ON DELETE CASCADE
        )`);

        db.run(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Umum'`, () => {});
        db.run(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT '1'`, () => {});
    });
}

function extractProducts(data) {
    if (!data) return [];
    let rawList = [];

    if (Array.isArray(data)) {
        rawList = data;
    } else if (typeof data === 'object') {
        rawList = data.data || data.products || data.result || data.pricelist || [];
    }

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

// ==================== HELPER PUSH NOTIFICATION ====================
async function kirimPushNotif(pesanTitle, pesanBody, targetId = null, isExternalId = false) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "8370e207-3701-48a6-82d0-45d76f860691";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "os_v2_app_qnyoebzxafeknawqixlw7bqgsg4qdtxh32hepyetm5b6vejyjxf2ytzjhhlkdesylzwvziwyzdzri6coxophimlamlqqsyjwcybhh3q";
        const targetUrl = (typeof BASE_URL !== 'undefined' && BASE_URL) ? BASE_URL : "https://arcellkomunika.site/";

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
            url: targetUrl,
            icon: LOGO_URL,
            large_icon: LOGO_URL,
            chrome_web_icon: LOGO_URL
        };

        const cleanTargetId = (targetId && String(targetId).trim() !== "" && String(targetId) !== "undefined") ? String(targetId).trim() : null;

        if (cleanTargetId) {
            if (isExternalId) {
                payload.include_aliases = {
                    external_id: [cleanTargetId]
                };
                payload.target_channel = "push";
            } else {
                payload.include_subscription_ids = [cleanTargetId];
            }
        } else {
            payload.included_segments = ["Subscribed Users"];
        }

        const response = await axios.post(
            'https://onesignal.com/api/v1/notifications',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Key ${ONESIGNAL_REST_KEY}`
                }
            }
        );

        if (response.data?.warnings?.invalid_external_user_ids) {
            console.log(`ℹ️ [Push Notif] User ${cleanTargetId} menerima notifikasi (beberapa perangkat diabaikan).`);
        } else {
            console.log("🔔 Push Notification Status:", response.data?.id || "OK");
        }
    } catch (err) {
        console.warn("⚠️ Warning Push Notif:", err.response?.data || err.message);
    }
}

// ==================== ENDPOINT OKECONNECT ====================
app.post('/api/okeconnect/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_hp, username, harga_jual, nama_produk, subscription_id } = req.body;
        const targetNo = customer_no || user_hp;
        const userPhone = normalizePhone(user_hp || customer_no);

        if (!buyer_sku_code || !targetNo) {
            return res.status(400).json({ status: 'failed', message: 'Parameter SKU dan Nomor Tujuan wajib diisi.' });
        }

        const cleanSku  = String(buyer_sku_code).trim();
        const cleanDest = String(targetNo).replace(/[^0-9]/g, '');

        if (cleanDest.length < 10 || cleanDest.length > 13) {
            return res.status(400).json({ status: 'failed', message: 'Nomor HP tidak valid (10-13 digit).' });
        }

        const priceVal = parseFloat(harga_jual) || 0;

        db.get("SELECT * FROM members WHERE phone = ?", [userPhone], async (err, member) => {
            if (err || !member) {
                return res.status(404).json({ status: 'failed', message: 'Member tidak terdaftar!' });
            }
            if (member.balance < priceVal) {
                return res.status(400).json({ status: 'failed', message: 'Saldo member tidak mencukupi!' });
            }

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
                        const MEMBER_ID = OKECONNECT_CONFIG.memberId;
                        const PIN_TRX   = OKECONNECT_CONFIG.pin;
                        const PASSWORD  = OKECONNECT_CONFIG.password;

                        const params = new URLSearchParams({
                            memberID: MEMBER_ID,
                            pin: PIN_TRX,
                            password: PASSWORD,
                            product: cleanSku,
                            dest: cleanDest,
                            refID: refId
                        });

                        const okeConnectUrl = `https://h2h.okeconnect.com/trx?${params.toString()}`;
                        console.log("--> [REQUEST OKECONNECT]:", okeConnectUrl);

                        const response = await axios.get(okeConnectUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            },
                            timeout: 15000
                        });

                        const resultText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                        console.log("--> [RESPONSE OKECONNECT]:", resultText);

                        const resUpper = resultText.toUpperCase();
                        
                        const isExplicitFailed = resUpper.includes("GAGAL") || 
                                                 resUpper.includes("SALDO TIDAK CUKUP") || 
                                                 resUpper.includes("SALDO KURANG");

                        const isSuccess = (resUpper.includes("PROSES") || 
                                           resUpper.includes("SUKSES") || 
                                           resUpper.includes("PENDING") ||
                                           resUpper.includes("AKAN DIPROSES")) && !isExplicitFailed;

                        if (isSuccess) {
                            db.run("UPDATE transactions SET status = 'Proses', message = ? WHERE ref_id = ?", [resultText, refId]);
                            
                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("Transaksi Diproses! ⚡", `Pembelian ${productName} ke ${cleanDest} sedang diproses.`, targetId, !subscription_id);

                            return res.json({
                                status: 'success',
                                message: 'Transaksi Berhasil Diproses',
                                data: { ref_id: refId, raw: resultText }
                            });
                        } else {
                            db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [priceVal, userPhone]);
                            db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [resultText, refId]);

                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("❌ Transaksi Gagal", `${productName} ke ${cleanDest} gagal: ${resultText}. Saldo dikembalikan.`, targetId, !subscription_id);

                            return res.status(400).json({
                                status: 'failed',
                                message: resultText
                            });
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
        console.error("❌ Error Checkout H2H OkeConnect:", error);
        return res.status(500).json({ status: 'failed', message: error.message });
    }
});

// ==================== CALLBACK / WEBHOOK OKECONNECT (FIXED) ====================
// Perbaikan: Hapus upload.none() agar express.json & urlencoded dapat membaca body
app.all(['/callback/okeconnect/event', '/api/okeconnect/callback'], express.urlencoded({ extended: true }), express.json(), async (req, res) => {
    try {
        let data = req.body;

        // Fallback jika dikirim raw text atau urlencoded manual
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                const searchParams = new URLSearchParams(data);
                data = Object.fromEntries(searchParams.entries());
            }
        } else if (!data || Object.keys(data).length === 0) {
            data = req.query || {};
        }

        console.log("🔔 [CALLBACK OKECONNECT / BUKAOLSHOP DITERIMA]:", JSON.stringify(data));

        // Ekstraksi parameter BukaOlshop / OkeConnect
        const refID = data.refid || data.ref_id || data.reffid || data.refID || data.trxid;
        const message = data.message || data.msg || data.keterangan || '';
        let sn = data.sn || data.sn_response || '-';
        let rawStatus = data.status || data.st || message;

        if (!refID) {
            console.warn("⚠️ Callback diterima tanpa refID yang valid:", data);
            return res.status(200).send("OK");
        }

        // Ekstrak SN dari teks message jika properti sn kosong / "-"
        if ((!sn || sn === '-') && message.includes('SN:')) {
            const snMatch = message.match(/SN:\s*([A-Za-z0-9]+)/i);
            if (snMatch && snMatch[1]) {
                sn = snMatch[1];
            }
        }

        // Wrap SQLite db.get ke dalam Promise agar async/await berfungsi dengan benar
        const trx = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM transactions WHERE ref_id = ?", [refID], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!trx) {
            console.error(`❌ Transaksi ref_id ${refID} tidak ditemukan di database.`);
            return res.status(200).send("OK");
        }

        const statusUpper = String(rawStatus).toUpperCase();
        let finalStatus = 'Pending';
        if (statusUpper.includes('SUKSES') || statusUpper.includes('LUNAS') || statusUpper.includes('SUCCESS')) {
            finalStatus = 'Sukses';
        } else if (statusUpper.includes('GAGAL') || statusUpper.includes('BATAL') || statusUpper.includes('REJECT') || statusUpper.includes('FAILED')) {
            finalStatus = 'Gagal';
        } else if (statusUpper.includes('PROSES') || statusUpper.includes('DIPROSES')) {
            finalStatus = 'Proses';
        }

        const statusLamaUpper = String(trx.status).toUpperCase();
        const statusBaruUpper = finalStatus.toUpperCase();

        if (statusLamaUpper === statusBaruUpper) {
            console.log(`ℹ️ Transaksi ${refID} sudah berstatus ${finalStatus}, mengabaikan duplikat.`);
            return res.status(200).send("OK");
        }

        // Update database secara synchronous (await)
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?`,
                [finalStatus, (sn !== '-' ? sn : trx.sn), message, refID],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        const userPhone = normalizePhone(trx.user_hp || trx.customer_no);
        const refundPrice = parseFloat(trx.harga || trx.price || 0);
        const targetId = trx.subscription_id || userPhone;
        const isExternalId = !trx.subscription_id;

        if (['GAGAL', 'BATAL'].includes(statusBaruUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
            await new Promise((resolve, reject) => {
                db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, userPhone], (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            await kirimPushNotif(
                "❌ Transaksi Gagal",
                `${trx.product_name || 'Produk'} ke ${trx.no_tujuan} GAGAL. Saldo Rp ${refundPrice.toLocaleString('id-ID')} dikembalikan.`,
                targetId,
                isExternalId
            );
        } else if (['SUKSES', 'LUNAS'].includes(statusBaruUpper) && !['SUKSES', 'LUNAS'].includes(statusLamaUpper)) {
            await kirimPushNotif(
                "🎉 Transaksi Berhasil!",
                `${trx.product_name || 'Produk'} ke ${trx.no_tujuan} SUKSES. SN: ${sn}`,
                targetId,
                isExternalId
            );
        }

        return res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Error Callback OkeConnect:", error);
        return res.status(200).send("OK");
    }
});

// SINKRONISASI PRODUK OKECONNECT
app.post('/api/admin/sync-okeconnect', async (req, res) => {
    try {
        console.log('🔄 Downloading Okeconnect Pricelist...');
        const pricelistUrl = OKECONNECT_CONFIG.pricelistUrl;

        const response = await axios.get(pricelistUrl, {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const productsList = extractProducts(response.data);

        if (!productsList || productsList.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Struktur JSON OkeConnect tidak terdeteksi atau SKU kosong.'
            });
        }

        let insertedCount = 0;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const stmt = db.prepare(`
                INSERT INTO products (buyer_sku_code, product_name, brand, type, category, price, jual, status, provider)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'okeconnect')
                ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name,
                    brand = excluded.brand,
                    type = excluded.type,
                    category = excluded.category,
                    price = excluded.price,
                    jual = excluded.jual,
                    provider = 'okeconnect'
            `);

            productsList.forEach(item => {
                const hargaModal = item.harga;
                const hargaJualAwal = hargaModal;

                stmt.run(
                    String(item.sku).trim(),
                    String(item.nama).trim(),
                    String(item.brand).trim(),
                    String(item.type).trim(),
                    String(item.type).trim(),
                    hargaModal,
                    hargaJualAwal,
                    item.status
                );
                insertedCount++;
            });

            stmt.finalize();

            db.run("COMMIT", (err) => {
                if (err) {
                    console.error("❌ Gagal Commit DB:", err.message);
                    return res.status(500).json({ status: 'error', message: 'Gagal Commit Database: ' + err.message });
                }

                console.log(`✅ Berhasil menyinkronkan ${insertedCount} produk OkeConnect ke SQLite!`);
                res.json({
                    status: 'success',
                    message: `Berhasil sinkronisasi ${insertedCount} produk OkeConnect ke SQLite!`,
                    total: insertedCount
                });
            });
        });

    } catch (err) {
        console.error('❌ Err Sync OkeConnect:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal terhubung ke OkeConnect: ' + err.message });
    }
});

app.get('/api/admin/okeconnect-saldo', async (req, res) => {
    try {
        const targetUrl = `${OKECONNECT_CONFIG.trxUrl}?memberID=${OKECONNECT_CONFIG.memberId}&pin=${OKECONNECT_CONFIG.pin}&password=${OKECONNECT_CONFIG.password}&act=sisa_saldo`;
        
        const response = await axios.get(targetUrl, { 
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const resText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const numbersOnly = resText.replace(/[^\d]/g, '');
        const saldoVal = numbersOnly ? parseInt(numbersOnly, 10) : 0;

        res.json({ status: 'success', balance: saldoVal, raw: resText });
    } catch (err) {
        console.error('Err Saldo:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil saldo dari OkeConnect', error: err.message });
    }
});

// ==================== ENDPOINT DIGIFLAZZ ====================

app.post('/api/digiflazz/checkout', async (req, res) => {
    const { buyer_sku_code, customer_no, user_hp, username, harga_jual, nama_produk, subscription_id } = req.body;
    const targetNo = customer_no || user_hp;
    const userPhone = normalizePhone(user_hp || customer_no);

    if (!buyer_sku_code || !targetNo) {
        return res.status(400).json({ status: 'error', message: 'SKU dan No Tujuan wajib diisi!' });
    }

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

                    db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?",
                        [finalStatus, dataRes?.sn || '', dataRes?.message || '', refId]);

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
                    db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?",
                        [apiErr.response?.data?.data?.message || 'Error Provider', refId]);

                    res.status(500).json({ status: 'error', message: 'Gagal ke provider' });
                }
            });
        });
    });
});

app.post('/api/digiflazz/webhook', (req, res) => {
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

                db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?",
                    [statusClean, cleanSn, message || '', ref_id]);

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
        console.error("❌ Webhook Error:", e);
        res.status(500).json({ status: 'error' });
    }
});

// SINKRONISASI PRODUK DIGIFLAZZ
app.post('/api/digiflazz/price-list', async (req, res) => {
    try {
        const username = USERNAME_DIGI.trim();
        const apiKey = API_KEY_DIGI.trim();

        if (!username || !apiKey) {
            return res.status(400).json({ status: 'error', message: 'Kredensial Digiflazz di .env belum diisi!' });
        }

        const sign = generateMD5(username + apiKey + "pricelist");
        const response = await axios.post('https://api.digiflazz.com/v1/price-list', {
            cmd: 'prepaid',
            username: username,
            sign: sign
        }, { timeout: 20000 });

        let products = response.data?.data || [];

        if (products.length > 0) {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare(`
                    INSERT INTO products (buyer_sku_code, product_name, brand, type, category, price, jual, provider) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'digiflazz')
                    ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name,
                    brand = excluded.brand,
                    type = excluded.type,
                    category = excluded.category,
                    price = excluded.price,
                    jual = excluded.jual,
                    provider = 'digiflazz'
                `);

                products.forEach(p => {
                    const sku = p.buyer_sku_code;
                    const name = p.product_name;
                    const brand = (p.brand || 'UMUM').toUpperCase();
                    const category = p.category || 'Umum';
                    const modalPrice = parseFloat(p.price || 0);
                    const jualPrice = modalPrice;

                    if (sku && name) {
                        stmt.run(sku, name, brand, category, category, modalPrice, jualPrice);
                    }
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
        console.error("❌ Error Price-List Digiflazz:", error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ==================== ENDPOINT PRODUK CLIENT ====================

app.get('/api/products', (req, res) => {
    const query = `
        SELECT * FROM products 
        WHERE provider = 'digiflazz' OR provider IS NULL OR provider = ''
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

app.get('/api/products/okeconnect', (req, res) => {
    const query = `
        SELECT 
            buyer_sku_code,
            buyer_sku_code AS code,
            buyer_sku_code AS sku,
            buyer_sku_code AS kode,
            product_name,
            brand,
            type,
            type AS kategori,
            price,
            jual,
            status,
            provider
        FROM products 
        WHERE provider = 'okeconnect'
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("❌ Error fetch OkeConnect products:", err.message);
            return res.status(500).json({ status: 'error', message: err.message });
        }
        res.json({ status: 'success', data: rows });
    });
});

// ==================== ENDPOINT MEMBER & HISTORY ====================

app.post('/api/member/login', (req, res) => {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'Nomor HP wajib diisi!' });
    const cleanPhone = normalizePhone(phone);

    db.get("SELECT * FROM members WHERE phone = ?", [cleanPhone], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal memproses login' });
        if (!row) {
            const memberId = 'ARC-' + Date.now().toString().slice(-6);
            const memberName = name || 'Member-' + cleanPhone.slice(-4);
            db.run("INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, 0)",
                [memberId, memberName, cleanPhone],
                function (err) {
                    if (err) return res.status(500).json({ status: 'error', message: 'Gagal buat akun' });
                    res.json({ status: 'success', message: 'Login berhasil', data: { member_id: memberId, name: memberName, phone: cleanPhone, balance: 0, status: 'aktif' } });
                }
            );
        } else {
            if (name && row.name !== name) {
                db.run("UPDATE members SET name = ? WHERE phone = ?", [name, cleanPhone]);
                row.name = name;
            }
            res.json({ status: 'success', message: 'Login berhasil', data: row });
        }
    });
});

app.get('/api/history', (req, res) => {
    const rawPhone = req.query.phone || req.query.hp || '';
    const phone = normalizePhone(rawPhone);

    if (!phone) return res.json({ status: 'success', data: [] });

    const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
    const sql = `SELECT * FROM transactions 
                 WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ?
                 ORDER BY id DESC`;

    db.all(sql, [phone, altPhone, phone, altPhone], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows || [] });
    });
});

// ==================== ADMIN MANAGEMENTS ENDPOINTS ====================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/saldo', async (req, res) => {
    try {
        if (!USERNAME_DIGI || !API_KEY_DIGI) return res.json({ deposit: 0 });
        const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + 'depo');
        const response = await axios.post('https://api.digiflazz.com/v1/cek-saldo', { cmd: 'deposit', username: USERNAME_DIGI, sign: sign });
        res.json({ status: 'success', deposit: response.data?.data?.deposit || 0 });
    } catch (err) {
        res.json({ status: 'error', deposit: 0 });
    }
});

app.post('/api/admin/products', (req, res) => {
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

app.post('/api/admin/products/status', (req, res) => {
    const { sku, status } = req.body;
    if (!sku) return res.status(400).json({ status: 'error', message: 'SKU Wajib' });

    db.run(`UPDATE products SET status = ? WHERE buyer_sku_code = ?`, [String(status), sku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Status produk berhasil diperbarui' });
    });
});

app.delete('/api/admin/products/:sku', (req, res) => {
    db.run("DELETE FROM products WHERE buyer_sku_code = ?", [req.params.sku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk dihapus' });
    });
});

app.post('/api/admin/products/okeconnect/status', (req, res) => {
    const { code, sku, status } = req.body;
    const kodeSku = code || sku;
    if (!kodeSku) return res.status(400).json({ status: 'error', message: 'Kode SKU Wajib' });

    db.run(`UPDATE products SET status = ? WHERE buyer_sku_code = ? AND provider = 'okeconnect'`, [String(status), kodeSku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Status produk Okeconnect diperbarui' });
    });
});

app.delete('/api/admin/products/okeconnect/:code', (req, res) => {
    const code = req.params.code;
    db.run("DELETE FROM products WHERE buyer_sku_code = ? AND provider = 'okeconnect'", [code], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk Okeconnect dihapus' });
    });
});

app.delete('/api/admin/categories/:name', (req, res) => {
    const catName = req.params.name;
    const { deleteProducts } = req.body || {};

    db.run(`DELETE FROM categories WHERE name = ?`, [catName], (err) => {
        if (err) console.error("Error delete category:", err.message);
    });

    if (deleteProducts) {
        db.run(`DELETE FROM products WHERE type = ? OR category = ? OR brand = ?`, [catName, catName, catName], (err) => {
            if (err) console.error("Error delete category products:", err.message);
        });
    }

    res.json({ status: 'success', message: 'Kategori dan produk berhasil dihapus' });
});

app.post('/api/admin/update-category', (req, res) => {
    const { skus, categoryName } = req.body;
    if (!skus || !Array.isArray(skus) || !categoryName) return res.status(400).json({ status: 'error' });

    const placeholders = skus.map(() => '?').join(',');
    db.run(`UPDATE products SET type = ?, category = ? WHERE buyer_sku_code IN (${placeholders})`, [categoryName, categoryName, ...skus], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Kategori dipindah' });
    });
});

app.get('/api/admin/members', (req, res) => {
    db.all("SELECT * FROM members ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/members', (req, res) => {
    const { name, phone, balance } = req.body;
    if (!name || !phone) return res.status(400).json({ status: 'error', message: 'Nama & No HP Wajib' });

    const memberId = 'MEM-' + Date.now().toString().slice(-5);
    db.run("INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, ?)", [memberId, name, normalizePhone(phone), parseFloat(balance) || 0], function(err) {
        if (err) return res.status(400).json({ status: 'error', message: 'Nomor HP sudah terdaftar' });
        res.json({ status: 'success', message: 'Member berhasil ditambahkan' });
    });
});

app.delete('/api/admin/members/:phone', (req, res) => {
    const cleanPhone = normalizePhone(req.params.phone);
    db.run("DELETE FROM members WHERE phone = ? OR member_id = ?", [cleanPhone, req.params.phone], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal menghapus member' });
        res.json({ status: 'success', message: 'Member berhasil dihapus' });
    });
});

app.post('/api/admin/update-user-balance', (req, res) => {
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

app.get('/api/admin/transactions', (req, res) => {
    const phone = req.query.phone ? normalizePhone(req.query.phone) : null;
    let sql = "SELECT * FROM transactions ORDER BY id DESC";
    let params = [];

    if (phone) {
        const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
        sql = `SELECT * FROM transactions 
               WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ?
               ORDER BY id DESC`;
        params = [phone, altPhone, phone, altPhone];
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        const normalizedRows = rows.map(row => ({
            ...row,
            user_hp: normalizePhone(row.user_hp || row.customer_no)
        }));
        res.json(normalizedRows);
    });
});

app.get('/api/transaction/detail', (req, res) => {
    const trxId = (req.query.id || '').trim();

    if (!trxId) {
        return res.status(400).json({ status: 'error', message: 'ID Transaksi kosong' });
    }

    const sql = `
        SELECT * FROM transactions 
        WHERE ref_id = ? OR id = ? OR no_tujuan = ? OR customer_no = ?
        LIMIT 1
    `;

    db.get(sql, [trxId, trxId, trxId, trxId], (err, row) => {
        if (err) {
            console.error("Database Error:", err.message);
            return res.status(500).json({ status: 'error', message: 'Gagal query database' });
        }

        if (!row) {
            return res.status(404).json({ status: 'error', message: 'Data transaksi tidak ditemukan' });
        }

        res.json({
            status: 'success',
            data: row
        });
    });
});

// ==================== ENDPOINT USER / CATEGORIES ====================

app.get('/api/user/products-by-prefix', (req, res) => {
    const { brand } = req.query;

    if (!brand) {
        return res.json({ status: 'success', data: {} });
    }

    const sql = `
        SELECT 
            cc.name as category_name,
            cp.provider,
            p.buyer_sku_code,
            p.product_name,
            p.jual,
            p.price,
            p.status
        FROM custom_categories cc
        JOIN category_products cp ON cc.id = cp.category_id
        JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND cp.provider = p.provider
        WHERE UPPER(cc.brand) = UPPER(?) AND p.status = '1'
        ORDER BY cc.sort_order ASC, p.jual ASC
    `;

    db.all(sql, [brand], (err, rows) => {
        if (err) {
            console.error("Error SQL Products Prefix:", err.message);
            return res.status(500).json({ status: 'error', message: err.message });
        }

        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.category_name]) {
                grouped[row.category_name] = [];
            }
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

app.get('/api/admin/custom-categories', (req, res) => {
    db.all(`SELECT * FROM custom_categories ORDER BY sort_order ASC, id DESC`, [], (err, categories) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        db.all(`
            SELECT cp.category_id, cp.buyer_sku_code, cp.provider, p.product_name, p.jual, p.price 
            FROM category_products cp
            JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND cp.provider = p.provider
        `, [], (err2, products) => {
            if (err2) return res.status(500).json({ status: 'error', message: err2.message });

            const result = categories.map(cat => ({
                ...cat,
                products: products.filter(p => p.category_id === cat.id)
            }));
            res.json({ status: 'success', data: result });
        });
    });
});

app.post('/api/admin/custom-categories', (req, res) => {
    const { name, brand } = req.body;
    db.run(`INSERT INTO custom_categories (name, brand) VALUES (?, ?)`, [name, brand], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', id: this.lastID });
    });
});

app.delete('/api/admin/custom-categories/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM custom_categories WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

app.post('/api/admin/map-category-product-bulk', (req, res) => {
    const { category_id, skus, provider } = req.body;
    if (!skus || skus.length === 0) return res.json({ status: 'success' });

    const stmt = db.prepare(`INSERT OR IGNORE INTO category_products (category_id, buyer_sku_code, provider) VALUES (?, ?, ?)`);
    skus.forEach(sku => stmt.run(category_id, sku, provider));
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

app.post('/api/admin/unmap-category-product', (req, res) => {
    const { category_id, buyer_sku_code, provider } = req.body;
    db.run(`DELETE FROM category_products WHERE category_id = ? AND buyer_sku_code = ? AND provider = ?`, 
        [category_id, buyer_sku_code, provider], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

// ==================== ENDPOINT FIX EDIT PRODUK CUSTOM (SQLITE) ====================
app.post('/api/admin/update-custom-product', (req, res) => {
    const { buyer_sku_code, product_name, price, provider } = req.body;

    if (!buyer_sku_code || !product_name || price === undefined) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'SKU Kode, Nama Produk, dan Harga wajib diisi!' 
        });
    }

    const priceVal = parseFloat(price) || 0;
    const cleanProvider = (provider || 'digiflazz').toLowerCase();

    const queryMaster = `
        UPDATE products 
        SET product_name = ?, price = ?, jual = ? 
        WHERE buyer_sku_code = ? AND LOWER(provider) = ?
    `;

    db.run(queryMaster, [product_name, priceVal, priceVal, buyer_sku_code, cleanProvider], function(err) {
        if (err) {
            console.error("❌ DB Error Update Master:", err.message);
            return res.status(500).json({ status: 'error', message: 'Gagal update database: ' + err.message });
        }

        if (this.changes > 0) {
            console.log(`✅ Success Update Product [${buyer_sku_code}]: ${product_name} - Rp ${priceVal}`);
            return res.json({ status: 'success', message: 'Produk berhasil diperbarui!' });
        }

        const queryFallback = `
            UPDATE products 
            SET product_name = ?, price = ?, jual = ? 
            WHERE buyer_sku_code = ?
        `;

        db.run(queryFallback, [product_name, priceVal, priceVal, buyer_sku_code], function(err2) {
            if (err2) {
                return res.status(500).json({ status: 'error', message: 'Gagal update fallback: ' + err2.message });
            }

            return res.json({ status: 'success', message: 'Produk berhasil diperbarui!' });
        });
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika berjalan di Port ${PORT}`);
});

