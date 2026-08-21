require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function generateMD5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Error DB:', err.message);
    else console.log('⚡ Connected to SQLite Database');
});

// Setup Tabel & Auto-Sync products.json
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT UNIQUE,
        phone TEXT UNIQUE,
        name TEXT,
        balance REAL DEFAULT 0,
        status TEXT DEFAULT 'aktif'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        buyer_sku_code TEXT PRIMARY KEY,
        product_name TEXT,
        brand TEXT,
        type TEXT DEFAULT 'Umum',
        price REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        name TEXT PRIMARY KEY
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        ref_id TEXT UNIQUE,
        customer_no TEXT,
        member_name TEXT,
        product_name TEXT,
        price REAL,
        status TEXT DEFAULT 'pending',
        sn TEXT DEFAULT '-'
    )`);

    // Inisialisasi Kategori Default
    const defaultCats = ['Freedom Internet', 'Freedom Sensasi', 'Pulsa', 'Umum'];
    defaultCats.forEach(cat => {
        db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [cat]);
    });

    // AUTO-IMPORT PRODUK DARI products.json JIKA TABEL KOSONG
    db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
        if (!err && row.count === 0) {
            const jsonPath = path.join(__dirname, 'products.json');
            if (fs.existsSync(jsonPath)) {
                try {
                    const jsonProducts = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    const list = Array.isArray(jsonProducts) ? jsonProducts : (jsonProducts.data || []);
                    
                    const stmt = db.prepare(`
                        INSERT OR REPLACE INTO products (buyer_sku_code, product_name, brand, type, price)
                        VALUES (?, ?, ?, ?, ?)
                    `);

                    list.forEach(p => {
                        const sku = p.buyer_sku_code || p.sku;
                        const name = p.product_name || p.nama_produk || p.nama;
                        const brand = p.brand || 'UMUM';
                        const type = p.type || p.category || 'Umum';
                        const price = p.price || p.jual || p.harga || 0;

                        if (sku && name) {
                            stmt.run(sku, name, brand, type, price);
                        }
                    });

                    stmt.finalize();
                    console.log(`✅ Berhasil mengimpor ${list.length} produk dari products.json ke Database SQLite!`);
                } catch (e) {
                    console.error('❌ Gagal membaca products.json:', e.message);
                }
            }
        }
    });
});

// ================= API ENDPOINTS =================

// SALDO
app.get('/api/saldo', async (req, res) => {
    try {
        if (!USERNAME_DIGI || !API_KEY_DIGI) return res.json({ deposit: 0 });
        const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + 'depo');
        const response = await axios.post('https://api.digiflazz.com/v1/cek-saldo', {
            cmd: 'deposit',
            username: USERNAME_DIGI,
            sign: sign
        });
        res.json({ deposit: response.data?.data?.deposit || 0 });
    } catch (err) {
        res.json({ deposit: 0 });
    }
});

// KATEGORI CUSTOM (PERMANEN)
app.get('/api/admin/categories', (req, res) => {
    db.all('SELECT name FROM categories', [], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows.map(r => r.name));
    });
});

app.post('/api/admin/categories', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: 'error' });
    db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name], (err) => {
        if (err) return res.status(500).json({ status: 'error' });
        res.json({ status: 'success' });
    });
});

app.post('/api/admin/delete-category', (req, res) => {
    const { categoryName } = req.body;
    db.run('DELETE FROM categories WHERE name = ?', [categoryName], () => {
        db.run('UPDATE products SET type = "Umum" WHERE type = ?', [categoryName], () => {
            res.json({ status: 'success' });
        });
    });
});

// PRODUK
app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products', [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', data: rows });
    });
});

app.post('/api/admin/products', (req, res) => {
    const { buyer_sku_code, product_name, brand, type, price } = req.body;
    const query = `
        INSERT INTO products (buyer_sku_code, product_name, brand, type, price)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(buyer_sku_code) DO UPDATE SET
            product_name = excluded.product_name,
            brand = excluded.brand,
            type = excluded.type,
            price = excluded.price
    `;
    db.run(query, [buyer_sku_code, product_name, brand, type, price], (err) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

app.delete('/api/admin/products/:sku', (req, res) => {
    db.run('DELETE FROM products WHERE buyer_sku_code = ?', [req.params.sku], (err) => {
        res.json({ status: 'success' });
    });
});

app.post('/api/admin/update-category', (req, res) => {
    const { skus, categoryName } = req.body;
    if (!skus || !Array.isArray(skus) || !categoryName) return res.status(400).json({ status: 'error' });

    const placeholders = skus.map(() => '?').join(',');
    db.run(`UPDATE products SET type = ? WHERE buyer_sku_code IN (${placeholders})`, [categoryName, ...skus], (err) => {
        res.json({ status: 'success' });
    });
});

// MEMBERS & TRANSACTIONS
app.get('/api/admin/members', (req, res) => {
    db.all('SELECT * FROM members ORDER BY id DESC', [], (err, rows) => {
        res.json({ status: 'success', data: rows || [] });
    });
});

app.post('/api/admin/members', (req, res) => {
    const { name, phone, balance } = req.body;
    const memberId = 'MEM' + Math.floor(1000 + Math.random() * 9000);
    db.run('INSERT INTO members (member_id, name, phone, balance) VALUES (?, ?, ?, ?)', [memberId, name, phone, balance || 0], (err) => {
        if (err) return res.status(400).json({ status: 'error', message: 'No HP sudah terdaftar' });
        res.json({ status: 'success' });
    });
});

app.delete('/api/admin/members/:id', (req, res) => {
    db.run('DELETE FROM members WHERE member_id = ? OR id = ?', [req.params.id, req.params.id], () => {
        res.json({ status: 'success' });
    });
});

app.post('/api/admin/update-user-balance', (req, res) => {
    const { phone, action, amount } = req.body;
    db.get('SELECT * FROM members WHERE phone = ?', [phone], (err, member) => {
        if (!member) return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan' });
        let newBal = action === 'tambah' ? member.balance + amount : Math.max(0, member.balance - amount);
        db.run('UPDATE members SET balance = ? WHERE phone = ?', [newBal, phone], () => {
            res.json({ status: 'success', message: 'Saldo diperbarui' });
        });
    });
});

app.get('/api/admin/transactions', (req, res) => {
    db.all('SELECT * FROM transactions ORDER BY date DESC', [], (err, rows) => {
        res.json({ status: 'success', data: rows || [] });
    });
});

// 🔹 ROUTE CHECKOUT (AUTO SAVE KE TRANSACTIONS.JSON & DB)
app.post('/api/digiflazz/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_hp, harga_jual, nama_produk } = req.body;
        
        if (!buyer_sku_code || !customer_no) {
            return res.status(400).json({ status: 'error', message: 'SKU dan No Tujuan wajib diisi' });
        }

        const refId = `TRX_${Date.now()}`;
        const sign = generateMD5(USERNAME_DIGI + API_KEY_DIGI + refId);
        const callbackUrl = `${BASE_URL}/api/digiflazz/webhook`;

        // 1. Tembak API Digiflazz
        const response = await axios.post('https://api.digiflazz.com/v1/transaction', {
            username: USERNAME_DIGI,
            buyer_sku_code: buyer_sku_code,
            customer_no: customer_no,
            ref_id: refId,
            sign: sign,
            testing: false,
            cb_url: callbackUrl
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        const dataRes = response.data?.data;
        if (!dataRes) {
            return res.status(400).json({ status: 'error', message: 'Respon Digiflazz kosong' });
        }

        const finalStatus = dataRes.status || 'Pending';
        const finalSn = dataRes.sn || '-';
        const finalHarga = harga_jual || dataRes.price || 0;
        const finalProduk = nama_produk || dataRes.buyer_sku_code || buyer_sku_code;
        const finalUserHp = user_hp || customer_no;
        const waktuSekarang = new Date().toLocaleString('id-ID');

        // 📝 2. SIMPAN / UPDATE KE FILE TRANSACTIONS.JSON
        const jsonPath = path.join(__dirname, 'transactions.json');
        let historyJson = [];

        if (fs.existsSync(jsonPath)) {
            try {
                const rawContent = fs.readFileSync(jsonPath, 'utf8');
                historyJson = JSON.parse(rawContent || '[]');
            } catch (e) {
                historyJson = [];
            }
        }

        const recordBaru = {
            ref_id: refId,
            user_hp: finalUserHp,
            no_tujuan: customer_no,
            sku: buyer_sku_code,
            produk: finalProduk,
            harga: finalHarga,
            status: finalStatus,
            sn: finalSn,
            message: dataRes.message || '',
            waktu: waktuSekarang
        };

        // Masukkan transaksi terbaru ke urutan PALING ATAS
        historyJson.unshift(recordBaru);

        // Tulis ulang file transactions.json
        fs.writeFileSync(jsonPath, JSON.stringify(historyJson, null, 2), 'utf8');
        console.log(`✅ Transaksi baru [${refId}] berhasil ditulis ke transactions.json!`);

        // 📝 3. Simpan juga ke Database SQLite (Optional/Backup)
        db.run(
            `INSERT INTO transactions (ref_id, customer_no, member_name, product_name, price, status, sn)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [refId, customer_no, finalUserHp, finalProduk, finalHarga, finalStatus, finalSn]
        );

        // 📝 4. Potong Saldo Member
        db.run('UPDATE members SET balance = MAX(0, balance - ?) WHERE phone = ? OR member_id = ?', [finalHarga, finalUserHp, finalUserHp]);

        res.json({ status: 'success', data: recordBaru });

    } catch (error) {
        console.error('❌ Error Checkout:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.response?.data?.data?.message || 'Gagal memproses transaksi' 
        });
    }
});

// 🔹 HELPER TEMBAK PUSH NOTIFIKASI ONESIGNAL
async function kirimPushNotif(pesanTitle, pesanBody) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "";

        const headers = { 'Content-Type': 'application/json' };

        if (ONESIGNAL_REST_KEY) {
            headers['Authorization'] = `Basic ${ONESIGNAL_REST_KEY}`;
        }

        await axios.post('https://onesignal.com/api/v1/notifications', {
            app_id: ONESIGNAL_APP_ID,
            included_segments: ["All"],
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody }
        }, { headers });

        console.log("🔔 Push Notification Berhasil Terkirim ke Layar HP!");
    } catch (err) {
        console.error("❌ Gagal Kirim Push Notif:", err.response?.data || err.message);
    }
}

// 🔹 ROUTE WEBHOOK DIGIFLAZZ (MURNI JSON + PUSH NOTIF)
app.post('/api/digiflazz/webhook', (req, res) => {
    try {
        console.log("📩 WEBHOOK CALLBACK MASUK DARI DIGIFLAZZ:", JSON.stringify(req.body));

        const bodyData = req.body.data || req.body;
        const ref_id = bodyData.ref_id;
        const status = bodyData.status; 
        const sn = bodyData.sn || '-';
        const msg = bodyData.message || '';

        if (ref_id) {
            const jsonPath = path.join(__dirname, 'transactions.json');

            if (fs.existsSync(jsonPath)) {
                const rawContent = fs.readFileSync(jsonPath, 'utf8');
                let historyJson = JSON.parse(rawContent || '[]');

                // 1. Cari indeks transaksi di file transactions.json
                const idx = historyJson.findIndex(h => String(h.ref_id).trim() === String(ref_id).trim());

                if (idx !== -1) {
                    const trx = historyJson[idx];

                    // 2. Update data transaksi di file JSON
                    historyJson[idx].status = status;
                    historyJson[idx].sn = (sn && sn !== '-') ? sn : historyJson[idx].sn;
                    historyJson[idx].message = msg;

                    // Simpan kembali pembaruan ke transactions.json
                    fs.writeFileSync(jsonPath, JSON.stringify(historyJson, null, 2), 'utf8');
                    console.log(`✅ Status [${ref_id}] DIUPDATE DI JSON VIA WEBHOOK JADI: ${status} | SN: ${sn}`);

                    // 3. 🔔 Kirim Push Notif ke Layar HP User
                    const statusUpper = String(status).toUpperCase();
                    const namaProduk = trx.produk || trx.sku || 'Produk PPOB';
                    const noTujuan = trx.no_tujuan || trx.user_hp || '';

                    if (statusUpper === 'SUKSES' || statusUpper === 'LUNAS') {
                        kirimPushNotif(
                            "🎉 Transaksi Berhasil!",
                            `${namaProduk} (${noTujuan}) SUKSES. SN: ${sn}`
                        );
                    } else if (statusUpper === 'GAGAL' || statusUpper === 'BATAL') {
                        kirimPushNotif(
                            "❌ Transaksi Gagal",
                            `${namaProduk} (${noTujuan}) Gagal diproses: ${msg}`
                        );
                    }
                } else {
                    console.warn(`⚠️ Ref ID [${ref_id}] tidak ditemukan di file transactions.json`);
                }
            }
        }

        // Respon 200 OK Wajib untuk Digiflazz
        res.status(200).json({ status: 'ok' });

    } catch (e) {
        console.error("❌ Error Webhook Processing:", e.message);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// 🔹 ROUTE RIWAYAT TRANSAKSI USER / PELANGGAN (DARI TRANSACTIONS.JSON)
app.get('/api/history', (req, res) => {
    const { hp } = req.query;
    const jsonPath = path.join(__dirname, 'transactions.json');

    if (!fs.existsSync(jsonPath)) {
        return res.json({ status: 'success', data: [] });
    }

    try {
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        let transactions = JSON.parse(rawData || '[]');

        if (!Array.isArray(transactions)) {
            transactions = [];
        }

        // Jika membawa parameter HP, filter riwayat khusus nomor HP tersebut
        if (hp && hp.trim() !== '' && hp !== 'null') {
            const cleanHp = hp.trim();
            transactions = transactions.filter(t => 
                String(t.no_tujuan).trim() === cleanHp || 
                String(t.user_hp).trim() === cleanHp
            );
        }

        // Format data dipastikan konsisten untuk history.html
        const formattedData = transactions.map(r => ({
            ref_id: r.ref_id,
            user_hp: r.user_hp || '-',
            no_tujuan: r.no_tujuan || r.user_hp || '-',
            produk: r.produk || r.sku || 'Produk PPOB',
            harga: r.harga || 0,
            status: r.status ? String(r.status).toUpperCase() : 'PENDING',
            waktu: r.waktu || '-'
        }));

        res.json({
            status: 'success',
            data: formattedData
        });

    } catch (err) {
        console.error('❌ Error Fetch History JSON:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal membaca riwayat transaksi' });
    }
});


// 🔹 ROUTE FETCH DETAIL TRANSAKSI JSON
app.get('/api/transaction/detail', (req, res) => {
    let { id } = req.query;
    const jsonPath = path.join(__dirname, 'transactions.json');

    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ status: 'error', message: 'File transactions.json tidak ditemukan' });
    }

    try {
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const transactions = JSON.parse(rawData || '[]');

        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Data transaksi kosong' });
        }

        let row = null;

        if (id && id.trim() !== '' && id !== 'null' && id !== 'undefined') {
            const searchId = id.trim();
            row = transactions.find(t => String(t.ref_id).trim() === searchId);
        } else {
            row = transactions[0];
        }

        if (!row) {
            return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });
        }

        res.json({
            status: 'success',
            data: {
                nomor_pembayaran: row.ref_id,
                status_pengiriman: row.status ? row.status.toUpperCase() : 'SUKSES',
                status_bayar: 'Lunas',
                tanggal_buat: row.waktu || new Date().toISOString(),
                bank_penerima: 'Saldo Member',
                total_transaksi: row.harga || 0,
                url_website: `${BASE_URL}/`,
                data_transaksi: [
                    {
                        ekspedisi: 'Produk Digital',
                        data_produk: [
                            {
                                nama_barang: row.produk || row.sku || 'Produk PPOB',
                                total_harga: row.harga || 0,
                                catatan: row.no_tujuan || row.user_hp || '-',
                                nomor_resi: row.sn && row.sn !== '-' ? row.sn : ''
                            }
                        ]
                    }
                ]
            }
        });

    } catch (err) {
        console.error('❌ Error Read transactions.json:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data transaksi' });
    }
});


app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));

