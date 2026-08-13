require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. KONFIGURASI DIGIFLAZZ
// ==========================================
const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL_DIGI = 'https://api.digiflazz.com/v1';

// ==========================================
// 2. DATABASE LOKAL (FILE JSON)
// ==========================================
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const TX_FILE = path.join(__dirname, 'data', 'transactions.json');

// Pastikan folder data dan file DB lokal tersedia
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(TX_FILE)) fs.writeFileSync(TX_FILE, '[]');

// Helper Read/Write Data
const getData = (file) => JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const saveData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ==========================================
// 3. MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper Sign Generator Digiflazz (MD5)
const generateSign = (cmd) => {
    return crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + cmd).digest('hex');
};

// ==========================================
// 4. ROUTE API DIGIFLAZZ
// ==========================================

// 🔹 A. Ambil Daftar Produk & Harga
app.post('/api/price-list', async (req, res) => {
    try {
        const { cmd } = req.body;
        const sign = generateSign('pricelist');
        
        const response = await axios.post(`${BASE_URL_DIGI}/price-list`, {
            cmd: cmd || 'prepaid',
            username: USERNAME_DIGI,
            sign: sign
        });

        res.json(response.data);
    } catch (error) {
        console.error("Error Price List:", error.response?.data || error.message);
        res.status(500).json({ status: 'failed', message: 'Gagal mengambil data dari Digiflazz' });
    }
});

// 🔹 B. Cek Saldo Admin Digiflazz
app.get('/api/saldo', async (req, res) => {
    try {
        const sign = generateSign('depo');
        const response = await axios.post(`${BASE_URL_DIGI}/check-balance`, {
            cmd: 'deposit',
            username: USERNAME_DIGI,
            sign: sign
        });

        res.json(response.data);
    } catch (error) {
        console.error("Error Cek Saldo:", error.message);
        res.status(500).json({ status: 'failed', message: 'Gagal mengecek saldo' });
    }
});

// 🔹 C. Transaksi Topup / Beli Produk
app.post('/api/topup', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, ref_id } = req.body;
        
        if (!buyer_sku_code || !customer_no) {
            return res.status(400).json({ status: 'failed', message: 'Parameter tidak lengkap' });
        }

        const refId = ref_id || `ARC-${Date.now()}`;
        const sign = generateSign(refId);

        const response = await axios.post(`${BASE_URL_DIGI}/transaction`, {
            username: USERNAME_DIGI,
            buyer_sku_code: buyer_sku_code,
            customer_no: customer_no,
            ref_id: refId,
            sign: sign
        });

        // Simpan ke Riwayat Transaksi Lokal
        const transactions = getData(TX_FILE);
        const newTx = {
            ref_id: refId,
            sku: buyer_sku_code,
            target: customer_no,
            status: response.data.data?.status || 'Pending',
            price: response.data.data?.price || 0,
            date: new Date().toISOString()
        };
        transactions.unshift(newTx);
        saveData(TX_FILE, transactions);

        res.json(response.data);
    } catch (error) {
        console.error("Error Transaksi:", error.response?.data || error.message);
        res.status(500).json({ status: 'failed', message: 'Transaksi gagal diproses' });
    }
});

// 🔹 D. Riwayat Transaksi Lokal
app.get('/api/riwayat', (req, res) => {
    const transactions = getData(TX_FILE);
    res.json({ status: 'success', data: transactions });
});

// ==========================================
// 5. ROUTE FALLBACK PAGE (SPA SUPPORT)
// ==========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 6. JALANKAN SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🚀 ARCELL KOMUNIKA - DIGIFLAZZ ENGINE READY!`);
    console.log(`📡 Server berjalan di Port: ${PORT}`);
    console.log(`===========================================`);
});

