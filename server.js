require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function generateMD5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

<<<<<<< HEAD
// ==================== CONFIG OKECONNECT ====================
const OKECONNECT_CONFIG = {
    memberId: 'OK2385636',
    password: '@noMmo123',
    pin: '1122',
    pricelistUrl: 'https://www.okeconnect.com/harga/json?id=905ccd028329b0a',
    trxUrl: 'https://h2h.okeconnect.com/trx'
};

// ==================== DATABASE INITIALIZATION ====================
=======
// ==================== DATABASE SQLITE INITIALIZATION ====================
>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Error DB:', err.message);
    else {
        console.log('⚡ Connected to SQLite Database');
        initTables();
    }
});

function initTables() {
    db.serialize(() => {
<<<<<<< HEAD
=======
        // Tabel Member
>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
        db.run(`CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id TEXT UNIQUE,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            balance REAL DEFAULT 0,
            status TEXT DEFAULT 'aktif',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

<<<<<<< HEAD
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
            waktu DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

=======
	    // Tabel Transaksi Presisi (SUDAH DIPERBAIKI)
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
        waktu DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

        // Tabel Produk
>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
        db.run(`CREATE TABLE IF NOT EXISTS products (
            buyer_sku_code TEXT PRIMARY KEY,
            product_name TEXT,
            brand TEXT,
            type TEXT DEFAULT 'Umum',
            price REAL,
<<<<<<< HEAD
            jual REAL,
            provider TEXT DEFAULT 'digiflazz'
=======
            jual REAL
>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
        )`);
    });
}

<<<<<<< HEAD
// Helper Rekursif untuk meratakan (flatten) data JSON Pricelist OkeConnect
function extractProducts(data) {
    let items = [];
    if (Array.isArray(data)) {
        return data;
    } else if (typeof data === 'object' && data !== null) {
        for (const key in data) {
            if (Array.isArray(data[key])) {
                items = items.concat(data[key]);
            } else if (typeof data[key] === 'object') {
                items = items.concat(extractProducts(data[key]));
            }
        }
    }
    return items;
}

// ==================== API ENDPOINTS ====================

app.get('/api/admin/okeconnect-saldo', async (req, res) => {
    try {
        // Enkripsi karakter khusus (@) pada password agar tidak terpotong
        const passwordEncoded = encodeURIComponent(OKECONNECT_CONFIG.password);

        // Buat URL Query resmi OkeConnect
        const targetUrl = `${OKECONNECT_CONFIG.trxUrl}?memberID=${OKECONNECT_CONFIG.memberId}&pin=${OKECONNECT_CONFIG.pin}&password=${passwordEncoded}&act=sisa_saldo`;

        // Kirim request via Axios
        const response = await axios.get(targetUrl, { 
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const resText = String(response.data);

        // Ambil semua deretan angka dari balasan OkeConnect
        const numbersOnly = resText.replace(/[^\d]/g, '');
        const saldoVal = numbersOnly ? parseInt(numbersOnly, 10) : 0;

        res.json({ 
            status: 'success', 
            balance: saldoVal, 
            raw: resText 
        });

    } catch (err) {
        console.error('Err Okeconnect Saldo:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. SYNC PRICELIST OKECONNECT KE SQLITE
app.post('/api/admin/sync-okeconnect', async (req, res) => {
    try {
        console.log('🔄 Downloading Okeconnect Pricelist...');
        const response = await axios.get(OKECONNECT_CONFIG.pricelistUrl, { 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const rawData = response.data;
        const productsList = extractProducts(rawData);

        if (!productsList || productsList.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Struktur JSON OkeConnect tidak dikenali atau kosong' });
        }

        let insertedCount = 0;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const stmt = db.prepare(`
                INSERT INTO products (buyer_sku_code, product_name, brand, type, price, jual, provider)
                VALUES (?, ?, ?, ?, ?, ?, 'okeconnect')
                ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name,
                    brand = excluded.brand,
                    type = excluded.type,
                    price = excluded.price,
                    provider = 'okeconnect'
            `);

            productsList.forEach(item => {
                const sku = item.kode || item.code || item.sku;
                const nama = item.nama || item.product_name || item.keterangan || item.layanan;
                const brand = item.kategori || item.category || item.brand || 'OKECONNECT';
                const type = item.tipe || item.type || 'Okeconnect';
                const harga = parseFloat(item.harga || item.price || 0);

                if (sku && nama) {
                    stmt.run(String(sku), String(nama), String(brand), String(type), harga, harga);
                    insertedCount++;
                }
            });

            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) {
                    return res.status(500).json({ status: 'error', message: 'Gagal Commit Database: ' + err.message });
                }
                res.json({ 
                    status: 'success', 
                    message: `Berhasil sinkronisasi ${insertedCount} produk OkeConnect ke SQLite!` 
                });
            });
        });

    } catch (err) {
        console.error('Err Sync:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 3. FETCH PRODUK OKECONNECT DARI SQLITE
app.get('/api/products/okeconnect', (req, res) => {
    db.all("SELECT * FROM products WHERE LOWER(provider) = 'okeconnect'", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', total: rows.length, data: rows || [] });
    });
});

// 4. FETCH PRODUK DIGIFLAZZ DARI SQLITE
app.get('/api/products/digiflazz', (req, res) => {
    db.all("SELECT * FROM products WHERE LOWER(provider) = 'digiflazz' OR provider IS NULL", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', total: rows.length, data: rows || [] });
    });
});

// 🔹 2. HELPER ONESIGNAL PUSH NOTIF (LENGKAP DENGAN LOGO ARCELL)
async function kirimPushNotif(pesanTitle, pesanBody, targetId = null, isExternalId = false) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "c7cc2a6a-84b8-4579-9c6b-f4d8077f0f65";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "";
        const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

        // Mencegah ReferenceError jika BASE_URL belum didefinisikan di server.js
        const targetUrl = (typeof BASE_URL !== 'undefined' && BASE_URL) ? BASE_URL : "/";

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
            url: targetUrl,
            
            // 🔹 IKON RESMI ARCELL KOMUNIKA UNTUK NOTIFIKASI ANDROID
            icon: LOGO_URL,
            large_icon: LOGO_URL,
            chrome_web_icon: LOGO_URL
        };

=======
// 🔹 2. HELPER ONESIGNAL PUSH NOTIF (LENGKAP DENGAN LOGO ARCELL)
async function kirimPushNotif(pesanTitle, pesanBody, targetId = null, isExternalId = false) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "c7cc2a6a-84b8-4579-9c6b-f4d8077f0f65";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "";
        const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

        // Mencegah ReferenceError jika BASE_URL belum didefinisikan di server.js
        const targetUrl = (typeof BASE_URL !== 'undefined' && BASE_URL) ? BASE_URL : "/";

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
            url: targetUrl,
            
            // 🔹 IKON RESMI ARCELL KOMUNIKA UNTUK NOTIFIKASI ANDROID
            icon: LOGO_URL,
            large_icon: LOGO_URL,
            chrome_web_icon: LOGO_URL
        };

>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
        const cleanTargetId = (targetId && String(targetId).trim() !== "" && String(targetId) !== "undefined") ? String(targetId).trim() : null;

        if (cleanTargetId) {
            if (isExternalId) {
                payload.target_channel = "push";
                payload.include_aliases = { external_id: [cleanTargetId] };
            } else {
                payload.include_subscription_ids = [cleanTargetId];
            }
        } else {
            // Broadcast ke seluruh pengguna terdaftar jika tidak ada targetId spesifik
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

        console.log("🔔 Push Notification Status:", response.data);
    } catch (err) {
        console.error("❌ Gagal Kirim Push Notif:", err.response?.data || err.message);
    }
}

// ==================== ROUTE LOGIN & HISTORY CLIENT ====================
app.post('/api/member/login', (req, res) => {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'Nomor HP wajib diisi!' });
    const cleanPhone = String(phone).trim();

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
    const phone = req.query.phone || req.query.hp || '';
    let query = "SELECT * FROM transactions ORDER BY id DESC";
    let params = [];

    if (phone) {
        query = "SELECT * FROM transactions WHERE user_hp = ? OR no_tujuan = ? OR customer_no = ? ORDER BY id DESC";
        params = [phone, phone, phone];
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message, data: [] });
        res.json({ status: 'success', data: rows || [] });
    });
});

// ==================== CHECKOUT TRANSAKSI DIGIFLAZZ ====================
app.post('/api/digiflazz/checkout', async (req, res) => {
    const { buyer_sku_code, customer_no, user_hp, username, harga_jual, nama_produk, subscription_id } = req.body;
    const targetNo = customer_no || user_hp;
    const userPhone = user_hp || customer_no;

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

            // ⚠️ SIMPAN JUGA subscription_id PADA TABEL TRANSAKSI AGAR WEBHOOK BISA MENGGUNA KANNYA NANTI
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
                        
                        // Notifikasi Langsung Jika Provider Langsung Merespon Gagal
                        const targetId = subscription_id || userPhone;
                        const isExt = !subscription_id;
                        await kirimPushNotif("❌ Transaksi Gagal", `${productName} ke ${targetNo} gagal: ${dataRes?.message || 'Error'}`, targetId, isExt);
                    } else {
                        // Notifikasi Saat Transaksi Diproses
                        const targetId = subscription_id || userPhone;
                        const isExt = !subscription_id;
                        await kirimPushNotif(
                            "Transaksi Diproses! 🛍️",
                            `Pembelian ${productName} senilai Rp ${priceVal.toLocaleString('id-ID')} ke ${targetNo} sedang diproses.`,
                            targetId,
                            isExt
                        );
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

<<<<<<< HEAD
app.post('/api/okeconnect/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_hp, username, nama_produk, harga_jual } = req.body;

        if (!buyer_sku_code || !customer_no) {
            return res.status(400).json({ status: 'error', message: 'Kode produk dan Nomor Tujuan wajib diisi' });
        }

        // Generate Ref ID Unik
        const refId = 'OK' + Date.now();

        // Enkripsi password agar aman di URL
        const encodedPass = encodeURIComponent(OKECONNECT_CONFIG.password);

        // Formulasi URL Transaksi H2H Okeconnect
        // Format standar: trx?memberID=xxx&pin=xxx&password=xxx&produk=SKU&dest=NOHP&refID=xxx
        const targetUrl = `${OKECONNECT_CONFIG.trxUrl}?memberID=${OKECONNECT_CONFIG.memberId}&pin=${OKECONNECT_CONFIG.pin}&password=${encodedPass}&produk=${buyer_sku_code}&dest=${customer_no}&refID=${refId}`;

        console.log('📡 Trx Request to Okeconnect:', targetUrl);

        const response = await axios.get(targetUrl, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const resText = String(response.data);
        console.log('📩 Respon Okeconnect Trx:', resText);

        // Simpan riwayat ke database SQLite
        db.run(`INSERT INTO transactions 
            (ref_id, username, user_hp, no_tujuan, customer_no, produk, product_name, harga, price, status, message) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
            [refId, username, user_hp, customer_no, customer_no, buyer_sku_code, nama_produk, harga_jual, harga_jual, resText]
        );

        res.json({
            status: 'success',
            message: 'Transaksi berhasil dikirim',
            data: {
                ref_id: refId,
                status: 'Pending',
                raw: resText
            }
        });

    } catch (err) {
        console.error('Err Trx Okeconnect:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ==================== WEBHOOK DIGIFLAZZ ====================
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

                // 🛑 CEK IDEMPOTENSI: Jika status sama dengan di DB, abaikan agar tidak kirim notif/refund 2x
                if (statusLamaUpper === statusUpper) {
                    return;
                }

                // Update Status Transaksi di Database
                db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?",
                    [statusClean, cleanSn, message || '', ref_id]);

                // Refund Saldo jika status berubah jadi GAGAL/BATAL (dan sebelumnya belum pernah gagal)
                if (['GAGAL', 'BATAL'].includes(statusUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
                    const targetHp = trx.user_hp || trx.customer_no;
                    const refundPrice = trx.harga || trx.price || 0;
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, targetHp]);
                }

                // 🔔 PENENTUAN TARGET PUSH NOTIFIKASI SPESIFIK USER
                const namaProduk = trx.produk || trx.product_name || 'Produk PPOB';
                const noTujuan = trx.no_tujuan || trx.customer_no || '';
                
                // Utamakan subscription_id, jika kosong gunakan user_hp (External ID)
                const targetId = trx.subscription_id || trx.user_hp;
                const isExternalId = !trx.subscription_id; 

                if (targetId) {
                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        await kirimPushNotif(
                            "🎉 Transaksi Berhasil!",
                            `${namaProduk} (${noTujuan}) SUKSES. SN: ${cleanSn}`,
                            targetId,
                            isExternalId
                        );
                    } else if (['GAGAL', 'BATAL'].includes(statusUpper)) {
                        await kirimPushNotif(
                            "❌ Transaksi Gagal",
                            `${namaProduk} (${noTujuan}) Gagal: ${message || 'Gagal diproses'}. Saldo dikembalikan.`,
                            targetId,
                            isExternalId
                        );
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

		// ==================== API SYNC DAFTAR HARGA DIGIFLAZZ (FULL SQLITE) ====================
app.post('/api/digiflazz/price-list', async (req, res) => {
    try {
        const username = (process.env.DIGIFLAZZ_USERNAME || '').trim();
        const apiKey = (process.env.DIGIFLAZZ_API_KEY || '').trim();
        
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
            // Gunakan Transaction SQLite agar proses insert/update ribuan produk sangat cepat
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                const stmt = db.prepare(`
                    INSERT INTO products (buyer_sku_code, product_name, brand, type, price, jual) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name,
                    brand = excluded.brand,
                    type = excluded.type,
                    price = excluded.price,
                    jual = excluded.jual
                `);

                products.forEach(p => {
                    const sku = p.buyer_sku_code;
                    const name = p.product_name;
                    const brand = (p.brand || 'UMUM').toUpperCase();
                    const category = p.category || 'Umum';
                    const modalPrice = parseFloat(p.price || 0);
                    
                    // TANPA MARKUP: Harga jual disamakan persis dengan harga modal Digiflazz
                    const jualPrice = modalPrice; 

                    if (sku && name) {
                        stmt.run(sku, name, brand, category, modalPrice, jualPrice);
                    }
                });

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error("❌ Error Commit Sync Products:", err.message);
                        return res.status(500).json({ status: 'error', message: 'Gagal simpan ke DB' });
                    }
                    console.log(`✅ Berhasil Sync ${products.length} produk dari Digiflazz ke SQLite (Tanpa Markup)!`);
                    res.json({ status: 'success', message: `${products.length} produk berhasil di-sync ke SQLite`, total: products.length });
                });
            });
        } else {
            res.json({ status: 'success', message: 'Tidak ada produk dari Digiflazz', total: 0 });
        }

    } catch (error) {
        console.error("❌ Error Price-List Digiflazz:", error.message);
        res.status(500).json({ status: 'error', message: error.message, data: [] });
    }
});


=======
// ==================== WEBHOOK DIGIFLAZZ ====================
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

                // 🛑 CEK IDEMPOTENSI: Jika status sama dengan di DB, abaikan agar tidak kirim notif/refund 2x
                if (statusLamaUpper === statusUpper) {
                    return;
                }

                // Update Status Transaksi di Database
                db.run("UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?",
                    [statusClean, cleanSn, message || '', ref_id]);

                // Refund Saldo jika status berubah jadi GAGAL/BATAL (dan sebelumnya belum pernah gagal)
                if (['GAGAL', 'BATAL'].includes(statusUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
                    const targetHp = trx.user_hp || trx.customer_no;
                    const refundPrice = trx.harga || trx.price || 0;
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, targetHp]);
                }

                // 🔔 PENENTUAN TARGET PUSH NOTIFIKASI SPESIFIK USER
                const namaProduk = trx.produk || trx.product_name || 'Produk PPOB';
                const noTujuan = trx.no_tujuan || trx.customer_no || '';
                
                // Utamakan subscription_id, jika kosong gunakan user_hp (External ID)
                const targetId = trx.subscription_id || trx.user_hp;
                const isExternalId = !trx.subscription_id; 

                if (targetId) {
                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        await kirimPushNotif(
                            "🎉 Transaksi Berhasil!",
                            `${namaProduk} (${noTujuan}) SUKSES. SN: ${cleanSn}`,
                            targetId,
                            isExternalId
                        );
                    } else if (['GAGAL', 'BATAL'].includes(statusUpper)) {
                        await kirimPushNotif(
                            "❌ Transaksi Gagal",
                            `${namaProduk} (${noTujuan}) Gagal: ${message || 'Gagal diproses'}. Saldo dikembalikan.`,
                            targetId,
                            isExternalId
                        );
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

// ==================== API SYNC DAFTAR HARGA DIGIFLAZZ (FULL SQLITE) ====================
app.post('/api/digiflazz/price-list', async (req, res) => {
    try {
        const username = (process.env.DIGIFLAZZ_USERNAME || '').trim();
        const apiKey = (process.env.DIGIFLAZZ_API_KEY || '').trim();
        
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
            // Gunakan Transaction SQLite agar proses insert ribuan produk sangat cepat
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                const stmt = db.prepare(`
                    INSERT INTO products (buyer_sku_code, product_name, brand, type, price, jual) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(buyer_sku_code) DO UPDATE SET
                    product_name = excluded.product_name,
                    brand = excluded.brand,
                    price = excluded.price
                `);

                products.forEach(p => {
                    const sku = p.buyer_sku_code;
                    const name = p.product_name;
                    const brand = (p.brand || 'UMUM').toUpperCase();
                    const category = p.category || 'Umum';
                    const modalPrice = parseFloat(p.price || 0);
                    // Margin keuntungan default misalnya +500 dari modal, atau samakan dengan modal
                    const jualPrice = modalPrice + 500; 

                    if (sku && name) {
                        stmt.run(sku, name, brand, category, modalPrice, jualPrice);
                    }
                });

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error("❌ Error Commit Sync Products:", err.message);
                        return res.status(500).json({ status: 'error', message: 'Gagal simpan ke DB' });
                    }
                    console.log(`✅ Berhasil Sync ${products.length} produk dari Digiflazz ke SQLite!`);
                    res.json({ status: 'success', message: `${products.length} produk berhasil di-sync ke SQLite`, total: products.length });
                });
            });
        } else {
            res.json({ status: 'success', message: 'Tidak ada produk dari Digiflazz', total: 0 });
        }

    } catch (error) {
        console.error("❌ Error Price-List Digiflazz:", error.message);
        res.status(500).json({ status: 'error', message: error.message, data: [] });
    }
});

>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
// Route Fetch Produk untuk frontend index.html & admin.html (Langsung dari SQLite)
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products ORDER BY brand ASC, product_name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message, data: [] });
        res.json(rows || []);
    });
});

app.get('/api/history', (req, res) => {
    const rawPhone = req.query.phone || req.query.hp || '';
    const phone = normalizePhone(rawPhone);

    // Jika parameter phone kosong, langsung kembalikan array kosong (bukan query ALL)
    if (!phone) {
        return res.json({ status: 'success', data: [] });
    }

    const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;

    const sql = `SELECT * FROM transactions 
                 WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ?
                 ORDER BY id DESC`;

    db.all(sql, [phone, altPhone, phone, altPhone], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

// ==================== ADMIN ENDPOINTS ====================

app.get('/api/transaction/detail', (req, res) => {
    const trxId = (req.query.id || '').trim();

    if (!trxId) {
        return res.status(400).json({ status: 'error', message: 'ID Transaksi kosong' });
    }

    // Mencari berdasarkan ref_id, id, atau no_tujuan
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


app.get('/api/saldo', async (req, res) => {
    try {
        if (!USERNAME_DIGI || !API_KEY_DIGI) return res.json({ deposit: 0 });
        const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + 'depo');
        const response = await axios.post('https://api.digiflazz.com/v1/cek-saldo', { cmd: 'deposit', username: USERNAME_DIGI, sign: sign });
        res.json({ status: 'success', deposit: response.data?.data?.deposit || 0 });
    } catch (err) { res.json({ status: 'error', deposit: 0 }); }
});

app.post('/api/admin/products', (req, res) => {
    const { buyer_sku_code, product_name, brand, type, price, jual } = req.body;
    if (!buyer_sku_code || !product_name) return res.status(400).json({ status: 'error', message: 'SKU Wajib' });

    const priceVal = parseFloat(price || jual || 0);
    const jualVal = parseFloat(jual || price || 0);

    const query = `INSERT INTO products (buyer_sku_code, product_name, brand, type, price, jual) 
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(buyer_sku_code) DO UPDATE SET
                   product_name = excluded.product_name, brand = excluded.brand, type = excluded.type,
                   price = excluded.price, jual = excluded.jual`;

    db.run(query, [buyer_sku_code, product_name, brand, type || 'Umum', priceVal, jualVal], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk disimpan' });
    });
});

app.delete('/api/admin/products/:sku', (req, res) => {
    db.run("DELETE FROM products WHERE buyer_sku_code = ?", [req.params.sku], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Produk dihapus' });
    });
});

app.post('/api/admin/update-category', (req, res) => {
    const { skus, categoryName } = req.body;
    if (!skus || !Array.isArray(skus) || !categoryName) return res.status(400).json({ status: 'error' });

    const placeholders = skus.map(() => '?').join(',');
    db.run(`UPDATE products SET type = ? WHERE buyer_sku_code IN (${placeholders})`, [categoryName, ...skus], function(err) {
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
    db.run("INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, ?)", [memberId, name, phone, parseFloat(balance) || 0], function(err) {
        if (err) return res.status(400).json({ status: 'error', message: 'Nomor HP sudah terdaftar' });
        res.json({ status: 'success', message: 'Member berhasil ditambahkan' });
    });
});

app.delete('/api/admin/members/:phone', (req, res) => {
    db.run("DELETE FROM members WHERE phone = ? OR member_id = ?", [req.params.phone, req.params.phone], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Member berhasil dihapus' });
    });
});

app.post('/api/admin/update-user-balance', (req, res) => {
    const { phone, action, amount } = req.body;
    const numAmount = parseFloat(amount) || 0;

    db.get("SELECT name, balance FROM members WHERE phone = ?", [phone], (err, row) => {
        if (err || !row) return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan' });

        let newBalance = action === 'tambah' ? row.balance + numAmount : Math.max(0, row.balance - numAmount);
        db.run("UPDATE members SET balance = ? WHERE phone = ?", [newBalance, phone], (err) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', message: `Saldo ${row.name} diperbarui` });
        });
    });
});

// Helper fungsi normalisasi No HP (Mengubah 628xxx menjadi 08xxx)
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('62')) {
        clean = '0' + clean.slice(2);
    }
    return clean;
}

app.get('/api/admin/transactions', (req, res) => {
    const phone = req.query.phone ? normalizePhone(req.query.phone) : null;

    let sql = "SELECT * FROM transactions ORDER BY id DESC";
    let params = [];

    // Jika dipanggil dengan query parameter phone (misal /api/admin/transactions?phone=081234...)
    if (phone) {
        // Mengantisipasi pencocokan format 08xx maupun 628xx di database
        const altPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
        sql = `SELECT * FROM transactions 
               WHERE user_hp = ? OR user_hp = ? OR customer_no = ? OR customer_no = ?
               ORDER BY id DESC`;
        params = [phone, altPhone, phone, altPhone];
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        
        // Memastikan format user_hp yang dikembalikan seragam ke format 08xxx
        const normalizedRows = rows.map(row => ({
            ...row,
            user_hp: normalizePhone(row.user_hp || row.customer_no)
        }));

        res.json(normalizedRows);
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
<<<<<<< HEAD
});
// =========================================================
// 📌 ENDPOINT SINKRONISASI & AMBIL PRODUK DIGIFLAZZ (SQLITE)
// =========================================================

// 1. Endpoint Sync Produk Digiflazz ke tabel products (database.db)
app.post('/api/digiflazz/sync-db', (req, res) => {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Data produk tidak valid atau kosong' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const stmt = db.prepare(`
            INSERT INTO products (buyer_sku_code, product_name, brand, type, price, jual)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(buyer_sku_code) DO UPDATE SET
                product_name = excluded.product_name,
                brand = excluded.brand,
                type = excluded.type,
                price = excluded.price,
                jual = excluded.jual
        `);

        products.forEach(p => {
            const hargaModal = p.price || 0;

            stmt.run(
                p.buyer_sku_code,
                p.product_name,
                p.brand || 'Lainnya',
                p.category || 'Umum',
                hargaModal,
            );
        });

        stmt.finalize();

        db.run("COMMIT", (err) => {
            if (err) {
                console.error("Error Sync Digiflazz DB:", err.message);
                return res.status(500).json({ status: 'error', message: err.message });
            }
            res.json({ status: 'success', message: `${products.length} produk berhasil disinkronkan ke database.db` });
        });
    });
});

// 2. Endpoint Get Produk dari tabel products (database.db)
app.get('/api/digiflazz/products', (req, res) => {
    db.all("SELECT buyer_sku_code, product_name, brand, type AS category, price, jual FROM products", [], (err, rows) => {
        if (err) {
            console.error("Error Get Products DB:", err.message);
            return res.status(500).json({ status: 'error', message: err.message });
        }
        res.json(rows);
    });
});


=======
});

>>>>>>> abe12ee20564b24e616c2d8c2e988e91622ec13e
app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika berjalan di Port ${PORT}`);
});
