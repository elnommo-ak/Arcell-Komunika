require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// KONFIGURASI DIGIFLAZZ
const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';
const BASE_URL_DIGI = 'https://api.digiflazz.com/v1';

// DATABASE LOKAL
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let transactionHistory = [];

function getUsers() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ROUTE HALAMAN WEB
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/member', (req, res) => res.sendFile(path.join(__dirname, 'public', 'member.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/riwayat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'custom-pages.html')));
app.get('/rekap', (req, res) => res.sendFile(path.join(__dirname, 'public', 'custom-pages.html')));
app.get('/downline', (req, res) => res.sendFile(path.join(__dirname, 'public', 'custom-pages.html')));

// 1. API PRODUK DIGIFLAZZ
app.get('/api/produk', async (req, res) => {
    try {
        const sign = crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + 'pricelist').digest('hex');
        const response = await axios.post(`${BASE_URL_DIGI}/price-list`, {
            cmd: 'prepaid',
            username: USERNAME_DIGI,
            sign: sign
        });
        return res.json({ status: 'success', data: response.data.data || [] });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: 'Gagal mengambil produk Digiflazz.' });
    }
});

// 2. API CHECKOUT TRANSAKSI
app.post('/api/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no, user_email, price } = req.body;
        const users = getUsers();
        const userIndex = users.findIndex(u => u.email.toLowerCase() === user_email?.toLowerCase());

        if (userIndex === -1) return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan.' });
        if (users[userIndex].saldo < parseInt(price || 0)) {
            return res.status(400).json({ status: 'error', message: 'Saldo Anda tidak cukup!' });
        }

        const ref_id = `ARCELL-${Date.now()}`;
        const sign = crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + ref_id).digest('hex');

        const response = await axios.post(`${BASE_URL_DIGI}/transaction`, {
            username: USERNAME_DIGI,
            buyer_sku_code: buyer_sku_code,
            customer_no: customer_no,
            ref_id: ref_id,
            sign: sign
        });

        const result = response.data.data;
        if (result && (result.status === 'Sukses' || result.status === 'Pending' || result.status === 'Process')) {
            users[userIndex].saldo -= parseInt(price || 0);
            saveUsers(users);
        }

        const newTx = {
            ref_id: ref_id,
            nomor_hp: customer_no,
            status: result?.status || 'Process',
            created_at: new Date().toLocaleDateString('id-ID') + " " + new Date().toLocaleTimeString('id-ID')
        };
        transactionHistory.unshift(newTx);

        return res.json({ status: 'success', message: 'Transaksi dikirim!', sisa_saldo: users[userIndex].saldo, data: newTx });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: 'Gagal memproses transaksi.' });
    }
});

// 3. API AUTH & ADMIN
app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (email === 'admin@arcell.com' && password === '123456') {
        return res.json({ status: 'success', user: { id: 'ADM-01', nama: 'Owner Arcell', email, saldo: 1000000, role: 'admin' } });
    }
    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email?.toLowerCase() && u.password === password);
    if (!user) return res.status(401).json({ status: 'error', message: 'Email/Password salah!' });
    return res.json({ status: 'success', user });
});

app.post('/api/register', (req, res) => {
    const { nama, email, password } = req.body || {};
    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === email?.toLowerCase())) {
        return res.status(400).json({ status: 'error', message: 'Email sudah terdaftar!' });
    }
    const newUser = { id: `MBR-${Date.now()}`, nama, email: email.toLowerCase(), password, saldo: 0, role: 'member' };
    users.push(newUser);
    saveUsers(users);
    return res.json({ status: 'success', message: 'Pendaftaran berhasil!', user: newUser });
});

app.get('/api/admin/members', (req, res) => res.json({ status: 'success', data: getUsers() }));
app.post('/api/admin/add-saldo', (req, res) => {
    const { email, nominal } = req.body || {};
    const users = getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email?.toLowerCase());
    if (idx === -1) return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan.' });
    users[idx].saldo = (parseInt(users[idx].saldo) || 0) + parseInt(nominal || 0);
    saveUsers(users);
    return res.json({ status: 'success', message: `Berhasil isi saldo ke ${users[idx].nama}` });
});
app.get('/api/riwayat', (req, res) => res.json({ status: 'success', data: transactionHistory }));

app.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 ARCELL KOMUNIKA - DIGIFLAZZ ENGINE READY!`);
    console.log(`📱 Akses Web: http://localhost:${PORT}`);
    console.log(`================================================`);
});

