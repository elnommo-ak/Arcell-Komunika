require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer();

// =========================================================================
// 1. CONFIGURATION & CONSTANTS
// =========================================================================
const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

const OKECONNECT_CONFIG = {
    memberId: process.env.OKECONNECT_MEMBER_ID || 'OK2385636',
    password: process.env.OKECONNECT_PASSWORD || '@noMmo123',
    pin: process.env.OKECONNECT_PIN || '1122',
    pricelistUrl: 'https://www.okeconnect.com/harga/json?id=905ccd028329b0a&produk=pulsa,kuota_telkomsel,kuota_byu,kuota_indosat,kuota_tri,kuota_xl,kuota_axis,kuota_smartfren,token_pln,saldo_gojek,cetak_voucher,digital,pascabayar',
    trxUrl: 'https://h2h.okeconnect.com/trx'
};

// =========================================================================
// 2. MIDDLEWARES & STATIC FILES
// =========================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// =========================================================================
// 3. UTILITY & HELPER FUNCTIONS
// =========================================================================
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

function cleanNumber(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return parseInt(String(val).replace(/[^0-9]/g, '')) || 0;
}

function getWibDateTimeString(dateObj = new Date()) {
    const wibDate = new Date(dateObj.getTime() + (7 * 60 * 60 * 1000));
    const yyyy = wibDate.getUTCFullYear();
    const mm = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(wibDate.getUTCDate()).padStart(2, '0');
    const hh = String(wibDate.getUTCHours()).padStart(2, '0');
    const min = String(wibDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(wibDate.getUTCSeconds()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
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
        const rawKategori = item.kategori || item.category || item.category_name || item.group || item.tipe || item.type || item.jenis || 'Umum';
        const rawOperator = item.operator || item.brand || item.provider || item.provider_name || 'OKECONNECT';
        const namaProduk = String(item.nama || item.product_name || item.product || item.layanan || item.keterangan || '').trim();

        let finalType = String(rawKategori).trim();
        let finalBrand = String(rawOperator).trim();

        let subCategory = '';
        const upperName = namaProduk.toUpperCase();

        if (upperName.includes('COMBO X-TRA (VIP)')) {
            subCategory = 'Combo X-Tra (VIP)';
        } else if (upperName.includes('COMBO X-TRA')) {
            subCategory = 'Combo X-Tra';
        } else if (upperName.includes('DATA REGULER')) {
            subCategory = 'Data Reguler';
        } else if (upperName.includes('VOUCHER DATA')) {
            subCategory = 'Voucher Data';
        } else if (upperName.includes('UNLIMITED')) {
            subCategory = 'Data Unlimited';
        } else if (upperName.includes('MINI')) {
            subCategory = 'Voucher Mini Data';
        } else {
            const words = namaProduk.split(' ');
            subCategory = words.length >= 2 ? `${words[0]} ${words[1]}` : (finalBrand !== 'OKECONNECT' ? finalBrand : 'Regular');
        }

        return {
            sku: item.kode || item.code || item.sku || item.service_id || item.id_produk || item.buyer_sku_code,
            nama: namaProduk,
            brand: finalBrand,
            type: finalType,
            category: finalType.toUpperCase(),
            sub_category: subCategory,
            harga: parseFloat(item.harga || item.price || item.harga_modal || item.harga_h2h || 0),
            status: item.status !== undefined ? String(item.status) : '1'
        };
    }).filter(item => item.sku && String(item.sku).trim() !== '-' && String(item.sku).trim() !== '');
}

// Push Notification Helper
async function kirimPushNotif(pesanTitle, pesanBody, targetId = null, isExternalId = false) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "";
        const targetUrl = (typeof BASE_URL !== 'undefined' && BASE_URL) ? BASE_URL : "/";
        const uniqueNotificationId = "notif_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
	    chrome_web_icon: LOGO_URL,
            url: targetUrl,
            collapse_id: uniqueNotificationId,
            web_push_topic: uniqueNotificationId
        };

        const cleanTargetId = (targetId && String(targetId).trim() !== "" && String(targetId) !== "undefined" && String(targetId) !== "null") ? String(targetId).trim() : null;

        if (cleanTargetId) {
            if (isExternalId) {
                payload.include_aliases = { external_id: [cleanTargetId] };
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

        console.log("🔔 Push Notification Status:", response.data?.id || "OK");
    } catch (err) {
        console.warn("⚠️ Warning Push Notif:", err.response?.data || err.message);
    }
}

async function kirimPushNotifAdmin(pesanTitle, pesanBody) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID_ADMIN || "";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY_ADMIN || "";
        const targetUrl = process.env.BASE_URL_ADMIN || "/";
        const uniqueNotificationId = "notif_adm_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
            url: targetUrl,
	    chrome_web_icon: LOGO_URL,
            collapse_id: uniqueNotificationId,
            web_push_topic: uniqueNotificationId,
            include_aliases: { external_id: ["admin_arcell"] },
            target_channel: "push"
        };

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

        console.log("🔔 Admin Push Notification Status:", response.data?.id || "OK");
    } catch (err) {
        console.warn("⚠️ Warning Admin Push Notif:", err.response?.data || err.message);
        try {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.include_aliases;
            delete fallbackPayload.target_channel;
            fallbackPayload.included_segments = ["Subscribed Users"];

            await axios.post(
                'https://onesignal.com/api/v1/notifications',
                fallbackPayload,
                { headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${ONESIGNAL_REST_KEY}` } }
            );
            console.log("🔔 Fallback Admin Broadcast Status: OK");
        } catch (fErr) {}
    }
}

// =========================================================================
// 4. DATABASE INITIALIZATION & CRON SCHEDULER
// =========================================================================
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('❌ Error Connecting to SQLite Database:', err.message);
    } else {
        console.log('⚡ Connected to SQLite Database');
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if (pragmaErr) console.error("Error Pragma FK:", pragmaErr.message);
            initTables();
            initScheduler();
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
            harga_jual REAL DEFAULT 0,
            price REAL,
            status TEXT DEFAULT 'Pending',
            sn TEXT DEFAULT '',
            message TEXT DEFAULT '',
            nomor_pembayaran TEXT,
            subscription_id TEXT,
            provider TEXT DEFAULT 'digiflazz',
            waktu DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_hp) REFERENCES members(phone) ON DELETE CASCADE ON UPDATE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
            buyer_sku_code TEXT PRIMARY KEY,
            product_name TEXT,
            brand TEXT,
            type TEXT DEFAULT 'Umum',
            category TEXT DEFAULT 'Umum',
            sub_category TEXT DEFAULT 'REGULER',
            price REAL,
            jual REAL,
            status TEXT DEFAULT '1',
            provider TEXT DEFAULT 'digiflazz'
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
            custom_name TEXT,
            custom_jual REAL,
            UNIQUE(category_id, buyer_sku_code, provider),
            FOREIGN KEY (category_id) REFERENCES custom_categories(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS scheduled_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_hp TEXT NOT NULL,
            username TEXT,
            buyer_sku_code TEXT NOT NULL,
            customer_no TEXT NOT NULL,
            nama_produk TEXT,
            harga_jual REAL DEFAULT 0,
            provider TEXT NOT NULL,
            schedule_time TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Safe Migrations
        db.run(`ALTER TABLE transactions ADD COLUMN harga_jual REAL DEFAULT 0`, () => {});
        db.run(`ALTER TABLE transactions ADD COLUMN provider TEXT DEFAULT 'digiflazz'`, () => {});
        db.run(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Umum'`, () => {});
        db.run(`ALTER TABLE products ADD COLUMN sub_category TEXT DEFAULT 'REGULER'`, () => {});
        db.run(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT '1'`, () => {});
        db.run(`ALTER TABLE category_products ADD COLUMN custom_name TEXT`, () => {});
        db.run(`ALTER TABLE category_products ADD COLUMN custom_jual REAL`, () => {});
    });
}

function initScheduler() {
    cron.schedule('* * * * *', () => {
        const localNowStr = getWibDateTimeString();

        db.all(
            `SELECT * FROM scheduled_transactions WHERE status = 'PENDING' AND schedule_time <= ?`,
            [localNowStr],
            async (err, rows) => {
                if (err) {
                    console.error("❌ Cron Query Error:", err.message);
                    return;
                }
                if (!rows || rows.length === 0) return;

                console.log(`⏰ [CRON] Diproses ${rows.length} transaksi terjadwal pada: ${localNowStr}`);

                for (const item of rows) {
                    db.run(`UPDATE scheduled_transactions SET status = 'PROCESSING' WHERE id = ?`, [item.id]);

                    const payload = {
                        buyer_sku_code: item.buyer_sku_code,
                        customer_no: item.customer_no,
                        user_hp: item.user_hp,
                        username: item.username,
                        nama_produk: item.nama_produk,
                        harga_jual: item.harga_jual,
                        subscription_id: ''
                    };

                    const localEndpoint = (item.provider || '').toLowerCase() === 'okeconnect'
                        ? `http://127.0.0.1:${PORT}/api/okeconnect/checkout`
                        : `http://127.0.0.1:${PORT}/api/digiflazz/checkout`;

                    try {
                        const response = await axios.post(localEndpoint, payload, { timeout: 30000 });
                        const resData = response.data;

                        if (resData.status === 'success' || resData.status === 200) {
                            db.run(`UPDATE scheduled_transactions SET status = 'SUCCESS' WHERE id = ?`, [item.id]);
                            console.log(`✅ [CRON SUCCESS] ID ${item.id} (${item.nama_produk})`);
                        } else {
                            db.run(`UPDATE scheduled_transactions SET status = 'FAILED' WHERE id = ?`, [item.id]);
                            console.log(`❌ [CRON FAILED] ID ${item.id}:`, resData.message);
                        }
                    } catch (e) {
                        console.error(`❌ Gagal Eksekusi Transaksi Terjadwal ID ${item.id}:`, e.message);
                        db.run(`UPDATE scheduled_transactions SET status = 'FAILED' WHERE id = ?`, [item.id]);
                    }
                }
            }
        );
    });
    console.log('⏰ Job Scheduler Transaksi Otomatis Aktif (setiap 1 menit)');
}

// =========================================================================
// 5. ROUTE VIEW / PAGE SERVING
// =========================================================================
app.get('/', (req, res) => {
    const host = req.headers.host || '';

    if (host.includes('admin.')) {
        return res.sendFile(path.join(__dirname, 'public/admin.html'));
    }
    return res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// =========================================================================
// 6. CLIENT & USER API ROUTES
// =========================================================================

// A. Member Auth & Profile
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

// B. Fetch Products for Client
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
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

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
            COALESCE(cp.custom_name, p.product_name) as product_name,
            COALESCE(cp.custom_jual, p.jual, p.price) as jual,
            p.price as modal_price,
            p.status
        FROM custom_categories cc
        JOIN category_products cp ON cc.id = cp.category_id
        JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND LOWER(cp.provider) = LOWER(p.provider)
        WHERE UPPER(cc.brand) = UPPER(?) AND p.status = '1'
        ORDER BY cc.sort_order ASC, jual ASC
    `;

    db.all(sql, [brand], (err, rows) => {
        if (err) {
            console.error("❌ Error SQL Products Prefix:", err.message);
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
                jual: parseFloat(row.jual || 0),
                price: parseFloat(row.modal_price || 0),
                _provider: row.provider
            });
        });

        res.json({ status: 'success', data: grouped });
    });
});

// C. Transaction History
app.get('/api/transaction/detail', (req, res) => {
    const trxId = (req.query.id || req.query.ref_id || '').trim();

    if (!trxId) {
        return res.status(400).json({ status: 'error', message: 'ID Transaksi kosong' });
    }

    const sql = `
        SELECT * FROM transactions 
        WHERE ref_id = ? OR id = ? OR no_tujuan = ? OR customer_no = ?
        LIMIT 1
    `;

    db.get(sql, [trxId, trxId, trxId, trxId], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Gagal query database' });
        if (!row) return res.status(404).json({ status: 'error', message: 'Data transaksi tidak ditemukan' });

        const finalHargaJual = parseFloat(row.harga_jual || row.price || row.harga || 0);
        const dataFormatted = {
            ...row,
            harga: finalHargaJual,
            harga_jual: finalHargaJual,
            price: finalHargaJual
        };

        res.json({ status: 'success', data: dataFormatted });
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
        
        const normalizedRows = (rows || []).map(row => {
            const finalHargaJual = parseFloat(row.harga_jual || row.price || row.harga || 0);
            return {
                ...row,
                harga: finalHargaJual,
                harga_jual: finalHargaJual,
                price: finalHargaJual,
                modal: parseFloat(row.harga || 0)
            };
        });

        res.json({ status: 'success', data: normalizedRows });
    });
});

// D. Scheduled Transactions (Feature)
app.post('/api/user/schedule-transaction', (req, res) => {
    const { user_hp, username, buyer_sku_code, customer_no, nama_produk, harga_jual, provider, schedule_time } = req.body;

    if (!schedule_time || !customer_no || !buyer_sku_code) {
        return res.status(400).json({ status: 'failed', message: 'Data penjadwalan tidak lengkap' });
    }

    const cleanUserHp = normalizePhone(user_hp || customer_no);

    let cleanScheduleTime = String(schedule_time).replace('T', ' ');
    if (cleanScheduleTime.length === 16) {
        cleanScheduleTime += ':00';
    }

    const query = `
        INSERT INTO scheduled_transactions 
        (user_hp, username, buyer_sku_code, customer_no, nama_produk, harga_jual, provider, schedule_time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [cleanUserHp, username || 'Member', buyer_sku_code, customer_no, nama_produk, parseFloat(harga_jual) || 0, provider || 'digiflazz', cleanScheduleTime], function(err) {
        if (err) {
            return res.status(500).json({ status: 'failed', message: err.message });
        }
        res.json({ status: 'success', message: 'Transaksi berhasil dijadwalkan!', schedule_id: this.lastID });
    });
});

app.get('/api/user/scheduled-transactions', (req, res) => {
    const customerNo = req.query.customer_no;
    if (!customerNo) return res.json({ status: 'success', data: [] });

    const cleanNo = normalizePhone(customerNo);

    db.all(
        `SELECT * FROM scheduled_transactions WHERE (customer_no = ? OR user_hp = ?) AND status = 'PENDING' ORDER BY schedule_time ASC`,
        [cleanNo, cleanNo],
        (err, rows) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', data: rows || [] });
        }
    );
});

app.delete('/api/user/scheduled-transactions/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM scheduled_transactions WHERE id = ? AND status = 'PENDING'`, [id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Transaksi terjadwal berhasil dibatalkan' });
    });
});

// =========================================================================
// 7. PROVIDER TRANSACTIONS & WEBHOOKS
// =========================================================================

// --- A. DIGIFLAZZ ---
app.post('/api/digiflazz/checkout', async (req, res) => {
    const { buyer_sku_code, customer_no, user_hp, username, harga_jual, harga_modal, nama_produk, subscription_id } = req.body;
    const targetNo = customer_no || user_hp;
    const userPhone = normalizePhone(user_hp || customer_no);

    if (!buyer_sku_code || !targetNo) {
        return res.status(400).json({ status: 'error', message: 'SKU dan No Tujuan wajib diisi!' });
    }

    const sqlDbProduct = `
        SELECT 
            p.price AS modal_db, 
            COALESCE(cp.custom_jual, p.jual, p.price) AS jual_db,
            COALESCE(cp.custom_name, p.product_name) AS nama_db
        FROM products p
        LEFT JOIN category_products cp ON p.buyer_sku_code = cp.buyer_sku_code AND LOWER(cp.provider) = 'digiflazz'
        WHERE p.buyer_sku_code = ? AND (p.provider = 'digiflazz' OR p.provider IS NULL OR p.provider = '')
        LIMIT 1
    `;

    db.get(sqlDbProduct, [buyer_sku_code], async (errDb, dbProd) => {
        const reqJual = parseFloat(harga_jual) || 0;
        const reqModal = parseFloat(harga_modal) || 0;

        const finalModal = dbProd ? dbProd.modal_db : (reqModal > 0 ? reqModal : reqJual);
        const finalJual  = reqJual > 0 ? reqJual : (dbProd ? dbProd.jual_db : finalModal);
        const productName = nama_produk || (dbProd ? dbProd.nama_db : buyer_sku_code);

        db.get("SELECT * FROM members WHERE phone = ?", [userPhone], async (err, member) => {
            if (err || !member) return res.status(404).json({ status: 'error', message: 'Member tidak terdaftar!' });
            if (member.balance < finalJual) return res.status(400).json({ status: 'error', message: 'Saldo member tidak mencukupi!' });

            const refId = 'TRX_' + Date.now();
            const memberName = username || member.name || 'Member Arcell';

            db.run("UPDATE members SET balance = balance - ? WHERE phone = ?", [finalJual, userPhone], (err) => {
                if (err) return res.status(500).json({ status: 'error', message: 'Gagal potong saldo' });

                const queryInsert = `INSERT INTO transactions
                    (ref_id, username, user_hp, no_tujuan, customer_no, produk, product_name, harga, harga_jual, price, status, subscription_id, provider)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, 'digiflazz')`;

                db.run(queryInsert, [refId, memberName, userPhone, targetNo, targetNo, productName, productName, finalModal, finalJual, finalJual, subscription_id || ''], async function (err) {
                    if (err) {
                        db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
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
                            db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("❌ Transaksi Gagal", `${productName} ke ${targetNo} gagal: ${dataRes?.message || 'Error'}`, targetId, !subscription_id);
                        } else {
                            const targetId = subscription_id || userPhone;
                            await kirimPushNotif("Transaksi Diproses! 🛍️", `Pembelian ${productName} senilai Rp ${finalJual.toLocaleString('id-ID')} ke ${targetNo} sedang diproses.`, targetId, !subscription_id);
                        }

                        res.json({ status: 'success', message: 'Transaksi berhasil diproses', ref_id: refId, data: dataRes });
                    } catch (apiErr) {
                        db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
                        db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?",
                            [apiErr.response?.data?.data?.message || 'Error Provider', refId]);

                        res.status(500).json({ status: 'error', message: 'Gagal ke provider' });
                    }
                });
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

                const userPhone = normalizePhone(trx.user_hp || trx.customer_no);
                const refundPrice = trx.harga_jual || trx.price || 0;

                if (['GAGAL', 'BATAL'].includes(statusUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
                    db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, userPhone]);
                }

                const namaProduk = trx.produk || trx.product_name || 'Produk PPOB';
                const noTujuan = trx.no_tujuan || trx.customer_no || '';
                const targetId = trx.subscription_id || userPhone;
                const isExternalId = !trx.subscription_id; 

                const memberRow = await new Promise((resolve) => {
                    db.get("SELECT name FROM members WHERE phone = ?", [userPhone], (err, row) => resolve(row));
                });
                const namaMember = memberRow?.name || trx.username || userPhone || 'Member';
                const snDisplay = (cleanSn && cleanSn !== '-') ? String(cleanSn).trim().substring(0, 24) : '-';

                // Push Notif Member
                if (targetId) {
                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        await kirimPushNotif("🎉 Transaksi Berhasil!", `${namaProduk} (${noTujuan}) SUKSES. SN: ${cleanSn}`, targetId, isExternalId);
                    } else if (['GAGAL', 'BATAL'].includes(statusUpper)) {
                        await kirimPushNotif("❌ Transaksi Gagal", `${namaProduk} (${noTujuan}) Gagal: ${message || 'Gagal diproses'}. Saldo dikembalikan.`, targetId, isExternalId);
                    }
                }

                // Push Notif Admin
                if (typeof kirimPushNotifAdmin === 'function') {
                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        kirimPushNotifAdmin(
                            `"${namaMember}" melakukan transaksi`,
                            `RefID: #${ref_id}\nProduk: ${namaProduk}\nTujuan: ${noTujuan}\nSN: ${snDisplay}`
                        );
                    } else if (['GAGAL', 'BATAL'].includes(statusUpper)) {
                        kirimPushNotifAdmin(
                            `❌ "${namaMember}" transaksi GAGAL`,
                            `RefID: #${ref_id}\nProduk: ${namaProduk}\nTujuan: ${noTujuan}\nSN: ${snDisplay}`
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

// --- B. OKECONNECT ---
app.post('/api/okeconnect/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_hp, username, harga_jual, harga_modal, nama_produk, subscription_id } = req.body;
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

        const sqlDbProduct = `
            SELECT 
                p.price AS modal_db, 
                COALESCE(cp.custom_jual, p.jual, p.price) AS jual_db,
                COALESCE(cp.custom_name, p.product_name) AS nama_db
            FROM products p
            LEFT JOIN category_products cp ON p.buyer_sku_code = cp.buyer_sku_code AND LOWER(cp.provider) = 'okeconnect'
            WHERE p.buyer_sku_code = ? AND (p.provider = 'okeconnect' OR p.provider IS NULL OR p.provider = '')
            LIMIT 1
        `;

        db.get(sqlDbProduct, [cleanSku], async (errDb, dbProd) => {
            const reqJual = parseFloat(harga_jual) || 0;
            const reqModal = parseFloat(harga_modal) || 0;

            const finalModal = dbProd ? dbProd.modal_db : (reqModal > 0 ? reqModal : reqJual);
            const finalJual  = reqJual > 0 ? reqJual : (dbProd ? dbProd.jual_db : finalModal);
            const productName = nama_produk || (dbProd ? dbProd.nama_db : cleanSku);

            db.get("SELECT * FROM members WHERE phone = ?", [userPhone], async (err, member) => {
                if (err || !member) {
                    return res.status(404).json({ status: 'failed', message: 'Member tidak terdaftar!' });
                }
                if (member.balance < finalJual) {
                    return res.status(400).json({ status: 'failed', message: 'Saldo member tidak mencukupi!' });
                }

                const refId = "ARC_" + Date.now();
                const memberName = username || member.name || 'Member Arcell';

                db.run("UPDATE members SET balance = balance - ? WHERE phone = ?", [finalJual, userPhone], async (err) => {
                    if (err) return res.status(500).json({ status: 'failed', message: 'Gagal memotong saldo member' });

                    const queryInsert = `INSERT INTO transactions
                        (ref_id, username, user_hp, no_tujuan, customer_no, produk, product_name, harga, harga_jual, price, status, subscription_id, provider)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, 'OKECONNECT')`;

                    db.run(queryInsert, [refId, memberName, userPhone, cleanDest, cleanDest, productName, productName, finalModal, finalJual, finalJual, subscription_id || ''], async function (err) {
                        if (err) {
                            db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
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
                            const response = await axios.get(okeConnectUrl, {
                                headers: { 'User-Agent': 'Mozilla/5.0' },
                                timeout: 15000
                            });

                            const resultText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                            const resUpper = resultText.toUpperCase();
                            
                            const isExplicitFailed = resUpper.includes("GAGAL") || resUpper.includes("SALDO TIDAK CUKUP");
                            const isSuccess = (resUpper.includes("PROSES") || resUpper.includes("SUKSES") || resUpper.includes("PENDING")) && !isExplicitFailed;

                            if (isSuccess) {
                                db.run("UPDATE transactions SET status = 'Proses', message = ? WHERE ref_id = ?", [resultText, refId]);
                                await kirimPushNotif("Transaksi Diproses! ⚡", `Pembelian ${productName} ke ${cleanDest} sedang diproses.`, subscription_id || userPhone, !subscription_id);

                                return res.json({
                                    status: 'success',
                                    message: 'Transaksi Berhasil Diproses',
                                    data: { ref_id: refId, raw: resultText }
                                });
                            } else {
                                db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
                                db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [resultText, refId]);
                                await kirimPushNotif("❌ Transaksi Gagal", `${productName} gagal: ${resultText}. Saldo dikembalikan.`, subscription_id || userPhone, !subscription_id);

                                return res.status(400).json({ status: 'failed', message: resultText });
                            }
                        } catch (error) {
                            db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [finalJual, userPhone]);
                            db.run("UPDATE transactions SET status = 'Gagal', message = ? WHERE ref_id = ?", [error.message, refId]);
                            return res.status(500).json({ status: 'failed', message: 'Gagal terhubung ke OkeConnect: ' + error.message });
                        }
                    });
                });
            });
        });
    } catch (error) {
        return res.status(500).json({ status: 'failed', message: error.message });
    }
});

app.all(['/callback/okeconnect/event', '/api/okeconnect/callback', '/api/webhook/okeconnect'], express.urlencoded({ extended: true }), express.json(), async (req, res) => {
    try {
        let data = req.body;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) {
                const searchParams = new URLSearchParams(data);
                data = Object.fromEntries(searchParams.entries());
            }
        } else if (!data || Object.keys(data).length === 0) {
            data = req.query || {};
        }

        console.log("🔔 [CALLBACK OKECONNECT DITERIMA]:", JSON.stringify(data));

        const refID = data.refid || data.ref_id || data.reffid || data.refID || data.trxid;
        const message = data.message || data.msg || data.keterangan || '';
        let sn = data.sn || data.sn_response || '-';
        let rawStatus = data.status || data.st || message;

        if (!refID) return res.status(200).send("OK");

        if ((!sn || sn === '-') && message.includes('SN:')) {
            const snMatch = message.match(/SN:\s*([^]*?)(?=\s*(?:\.|\*|\b)\s*(?:Saldo|Sisa Pulsa|@\d{2}\/\d{2})|$)/i);
            if (snMatch && snMatch[1]) {
                sn = snMatch[1].replace(/\s*\.?\s*$/, '').trim();
            }
        }

        const snClean = (sn && sn !== '-') ? String(sn).trim().substring(0, 24) : '-';

        const trx = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM transactions WHERE ref_id = ?", [refID], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!trx) {
            const targetHp = normalizePhone(data.user_hp || data.phone || data.target || data.no_tujuan || '');
            const rawSt = String(rawStatus).toUpperCase();
            let normSt = 'Pending';
            if (rawSt.includes('SUKSES') || rawSt.includes('LUNAS') || rawSt.includes('SUCCESS') || rawSt === '1') normSt = 'Sukses';
            else if (rawSt.includes('GAGAL') || rawSt.includes('BATAL') || rawSt.includes('FAILED') || rawSt === '0') normSt = 'Gagal';

            db.run(
                `INSERT INTO transactions (ref_id, user_hp, no_tujuan, customer_no, produk, product_name, harga, harga_jual, price, status, sn, message, provider)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'OKECONNECT')`,
                [refID, targetHp, targetHp, targetHp, data.produk || 'Produk OkeConnect', data.produk || 'Produk OkeConnect', normSt, sn !== '-' ? sn : '', message]
            );

            if (typeof kirimPushNotifAdmin === 'function') {
                const namaMember = data.username || data.nama_member || targetHp || 'Member';
                const namaProduk = data.produk || 'Produk OkeConnect';
                
                kirimPushNotifAdmin(
                    `"${namaMember}" melakukan transaksi`,
                    `RefID: #${refID}\nProduk: ${namaProduk}\nTujuan: ${targetHp}\nSN: ${snClean}`
                );
            }

            return res.status(200).send("OK");
        }

        const statusUpper = String(rawStatus).toUpperCase();
        let finalStatus = 'Pending';
        if (statusUpper.includes('SUKSES') || statusUpper.includes('LUNAS') || statusUpper.includes('SUCCESS') || statusUpper === '1') {
            finalStatus = 'Sukses';
        } else if (statusUpper.includes('GAGAL') || statusUpper.includes('BATAL') || statusUpper.includes('REJECT') || statusUpper.includes('FAILED') || statusUpper === '0') {
            finalStatus = 'Gagal';
        } else if (statusUpper.includes('PROSES') || statusUpper.includes('DIPROSES')) {
            finalStatus = 'Proses';
        }

        const statusLamaUpper = String(trx.status).toUpperCase();
        const statusBaruUpper = finalStatus.toUpperCase();

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE transactions SET status = ?, sn = ?, message = ? WHERE ref_id = ?`,
                [finalStatus, (sn !== '-' ? sn : trx.sn), message, refID],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        const userPhone = normalizePhone(trx.user_hp || trx.customer_no);
        const refundPrice = parseFloat(trx.harga_jual || trx.price || 0);
        const targetId = trx.subscription_id || userPhone;
        const isExternalId = !trx.subscription_id;

        const memberRow = await new Promise((resolve) => {
            db.get("SELECT name FROM members WHERE phone = ?", [userPhone], (err, row) => resolve(row));
        });
        const namaMember = memberRow?.name || trx.username || userPhone || 'Member';
        const namaProduk = trx.product_name || trx.produk || 'Produk PPOB';

        if (['GAGAL', 'BATAL'].includes(statusBaruUpper) && !['GAGAL', 'BATAL'].includes(statusLamaUpper)) {
            await new Promise((resolve, reject) => {
                db.run("UPDATE members SET balance = balance + ? WHERE phone = ?", [refundPrice, userPhone], (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            await kirimPushNotif(
                "❌ Transaksi Gagal",
                `${namaProduk} ke ${trx.no_tujuan} GAGAL. Saldo Rp ${refundPrice.toLocaleString('id-ID')} dikembalikan.`,
                targetId,
                isExternalId
            );

            if (typeof kirimPushNotifAdmin === 'function') {
                kirimPushNotifAdmin(
                    `❌ "${namaMember}" transaksi GAGAL`,
                    `RefID: #${refID}\nProduk: ${namaProduk}\nTujuan: ${trx.no_tujuan}\nSN: ${snClean}`
                );
            }

        } else if (['SUKSES', 'LUNAS'].includes(statusBaruUpper) && !['SUKSES', 'LUNAS'].includes(statusLamaUpper)) {
            await kirimPushNotif(
                "🎉 Transaksi Berhasil!",
                `${namaProduk} ke ${trx.no_tujuan} SUKSES. SN: ${sn}`,
                targetId,
                isExternalId
            );

            if (typeof kirimPushNotifAdmin === 'function') {
                kirimPushNotifAdmin(
                    `"${namaMember}" melakukan transaksi`,
                    `RefID: #${refID}\nProduk: ${namaProduk}\nTujuan: ${trx.no_tujuan}\nSN: ${snClean}`
                );
            }
        }

        return res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Error Callback OkeConnect:", error);
        return res.status(200).send("OK");
    }
});

// =========================================================================
// 8. ADMIN MANAGEMENT API ROUTES
// =========================================================================

// A. Check Provider Balances
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

app.get('/api/admin/okeconnect-saldo', async (req, res) => {
    try {
        const targetUrl = `${OKECONNECT_CONFIG.trxUrl}?memberID=${OKECONNECT_CONFIG.memberId}&pin=${OKECONNECT_CONFIG.pin}&password=${OKECONNECT_CONFIG.password}&act=sisa_saldo`;
        const response = await axios.get(targetUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const resText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const numbersOnly = resText.replace(/[^\d]/g, '');
        const saldoVal = numbersOnly ? parseInt(numbersOnly, 10) : 0;
        res.json({ status: 'success', balance: saldoVal, raw: resText });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil saldo dari OkeConnect', error: err.message });
    }
});

// B. Sync Products From Providers
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
                    brand = excluded.brand,
                    type = excluded.type,
                    category = excluded.category,
                    price = excluded.price,
                    provider = 'digiflazz'
                `);

                products.forEach(p => {
                    const sku = p.buyer_sku_code;
                    const name = p.product_name;
                    const brand = (p.brand || 'UMUM').toUpperCase();
                    const category = p.category || 'Umum';
                    const modalPrice = parseFloat(p.price || 0);

                    if (sku && name) {
                        stmt.run(sku, name, brand, category, category, modalPrice, modalPrice);
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

app.post('/api/admin/sync-okeconnect', async (req, res) => {
    try {
        console.log('🔄 Downloading Okeconnect Pricelist...');
        const pricelistUrl = OKECONNECT_CONFIG.pricelistUrl;

        const response = await axios.get(pricelistUrl, {
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const productsList = extractProducts(response.data);

        if (!productsList || productsList.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Struktur JSON OkeConnect tidak terdeteksi atau SKU kosong.'
            });
        }

        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION", (err) => {
                    if (err) return reject(err);
                });

                const stmt = db.prepare(`
                    INSERT INTO products (buyer_sku_code, product_name, brand, type, category, sub_category, price, jual, status, provider)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'okeconnect')
                    ON CONFLICT(buyer_sku_code) DO UPDATE SET
                        brand = excluded.brand,
                        type = excluded.type,
                        category = excluded.category,
                        sub_category = excluded.sub_category,
                        price = excluded.price,
                        provider = 'okeconnect'
                `);

                productsList.forEach(item => {
                    const hargaModal = item.harga || 0;
                    const namaProduk = String(item.nama || item.product_name || '').trim();
                    const kategoriUtama = String(item.category || item.type || 'LAINNYA').trim().toUpperCase();
                    const subKategori = String(item.sub_category || item.brand || 'REGULER').trim();

                    stmt.run(
                        String(item.sku).trim(),
                        namaProduk,
                        String(item.brand || '').trim(),
                        String(item.type || '').trim(),
                        kategoriUtama,
                        subKategori,
                        hargaModal,
                        hargaModal,
                        String(item.status || '1')
                    );
                });

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    resolve();
                });
            });
        });

        console.log(`✅ Berhasil menyinkronkan ${productsList.length} produk OkeConnect!`);
        res.json({
            status: 'success',
            message: `Berhasil sinkronisasi ${productsList.length} produk OkeConnect!`,
            total: productsList.length
        });

    } catch (err) {
        console.error('❌ Err Sync OkeConnect:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal sinkronisasi OkeConnect: ' + err.message });
    }
});

// C. Product Master & Mapping
app.get('/api/admin/products', (req, res) => {
    const sqlMappedProducts = `
        SELECT 
            cp.buyer_sku_code,
            cp.provider,
            COALESCE(cp.custom_name, p.product_name) AS product_name,
            COALESCE(cp.custom_jual, p.jual, p.price) AS harga_jual,
            p.price AS harga_modal
        FROM category_products cp
        JOIN products p 
            ON cp.buyer_sku_code = p.buyer_sku_code 
            AND LOWER(cp.provider) = LOWER(p.provider)
        ORDER BY product_name ASC
    `;

    db.all(sqlMappedProducts, [], (err, rows) => {
        if (err) {
            console.error("❌ Error Fetch Mapped Products Kasir:", err.message);
            return res.status(500).json({ status: 'error', message: err.message });
        }
        res.json({ status: 'success', data: rows });
    });
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

// D. Custom Categories & Product Mapping
app.get('/api/admin/custom-categories', (req, res) => {
    db.all(`SELECT * FROM custom_categories ORDER BY sort_order ASC, id DESC`, [], (err, categories) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        db.all(`
            SELECT 
                cp.category_id, 
                cp.buyer_sku_code, 
                cp.provider, 
                COALESCE(cp.custom_name, p.product_name) as product_name, 
                COALESCE(cp.custom_jual, p.jual, p.price) as jual, 
                p.price as harga_modal
            FROM category_products cp
            JOIN products p ON cp.buyer_sku_code = p.buyer_sku_code AND LOWER(cp.provider) = LOWER(p.provider)
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
    if (!skus || !Array.isArray(skus) || skus.length === 0) return res.json({ status: 'success' });

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO category_products (category_id, buyer_sku_code, provider) 
        VALUES (?, ?, ?)
    `);
    
    skus.forEach(sku => stmt.run(category_id, sku, provider));
    stmt.finalize(err => {
        if (err) {
            console.error("❌ Error Bulk Mapping:", err.message);
            return res.status(500).json({ status: 'error', message: err.message });
        }
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

app.post('/api/admin/update-custom-product', (req, res) => {
    const { category_id, buyer_sku_code, product_name, price, provider } = req.body;

    if (!buyer_sku_code || !product_name || price === undefined) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'SKU Kode, Nama Produk, dan Harga Jual wajib diisi!' 
        });
    }

    const hargaJual = parseFloat(price) || 0;
    const cleanProvider = (provider || 'digiflazz').toLowerCase();

    const queryCustom = `
        UPDATE category_products 
        SET custom_name = ?, custom_jual = ? 
        WHERE category_id = ? AND buyer_sku_code = ? AND LOWER(provider) = ?
    `;

    db.run(queryCustom, [product_name, hargaJual, category_id, buyer_sku_code, cleanProvider], function(err) {
        if (err) {
            return res.status(500).json({ status: 'error', message: 'Gagal update produk custom: ' + err.message });
        }
        return res.json({ status: 'success', message: 'Harga Jual berhasil diperbarui dan dikunci!' });
    });
});

// E. Member Management
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

// F. Admin Transactions Management
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

app.post('/api/admin/update-transaction-price', (req, res) => {
    const { ref_id, harga_modal, harga_jual, new_price } = req.body;
    const refId = String(ref_id || '').trim();

    if (!refId) {
        return res.status(400).json({ status: 'error', message: 'Ref ID Wajib' });
    }

    const modalVal = parseFloat(harga_modal !== undefined ? harga_modal : (new_price || 0));
    const jualVal  = parseFloat(harga_jual !== undefined ? harga_jual : (new_price || 0));

    db.run(
        `UPDATE transactions SET harga = ?, harga_jual = ?, price = ? WHERE ref_id = ?`,
        [modalVal, jualVal, jualVal, refId],
        function(err) {
            if (err) {
                return res.status(500).json({ status: 'error', message: err.message });
            }
            res.json({ status: 'success', message: 'Harga transaksi berhasil diperbarui' });
        }
    );
});

// Endpoint untuk memperbarui Status & SN Transaksi
app.post('/api/admin/update-transaction-status', (req, res) => {
    const { ref_id, status, sn } = req.body;

    if (!ref_id || !status) {
        return res.status(400).json({ status: 'error', message: 'Ref ID dan Status wajib diisi' });
    }

    // Query update ke database (Contoh SQLite / MySQL)
    const sql = `UPDATE transactions SET status = ?, sn = ? WHERE ref_id = ? OR id = ?`;
    
    db.run(sql, [status, sn || '', ref_id, ref_id], function(err) {
        if (err) {
            console.error('Gagal update status transaksi:', err.message);
            return res.status(500).json({ status: 'error', message: 'Gagal memperbarui database: ' + err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });
        }

        res.json({ 
            status: 'success', 
            message: `Status transaksi #${ref_id} berhasil diubah menjadi ${status}` 
        });
    });
});

// =========================================================================
// 9. START SERVER
// =========================================================================
app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika berjalan di Port ${PORT}`);
});

