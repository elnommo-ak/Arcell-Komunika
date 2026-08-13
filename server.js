require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const USERNAME_DIGI = process.env.DIGIFLAZZ_USERNAME || '';
const API_KEY_DIGI = process.env.DIGIFLAZZ_API_KEY || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔹 ROUTE CEK SALDO REAL DIGIFLAZZ (URL DIREVISI KE /v1/cek-saldo)
app.get('/api/saldo', async (req, res) => {
    try {
        const sign = crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + 'depo').digest('hex');

        const response = await axios.post('https://api.digiflazz.com/v1/cek-saldo', {
            cmd: 'deposit',
            username: USERNAME_DIGI,
            sign: sign
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Error Cek Saldo:", error.response?.data || error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Gagal cek saldo', 
            detail: error.response?.data || error.message 
        });
    }
});


// 🔹 ROUTE PRICE LIST (POST)
app.post('/api/digiflazz/price-list', async (req, res) => {
    try {
        const { brand } = req.body;
        const sign = crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + 'pricelist').digest('hex');
        
        const response = await axios.post('https://api.digiflazz.com/v1/price-list', {
            cmd: 'prepaid',
            username: USERNAME_DIGI,
            sign: sign
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        let products = response.data.data || [];
        if (brand) {
            products = products.filter(p => {
                let pBrand = (p.brand || '').toLowerCase();
                let searchBrand = brand.toLowerCase();
                return pBrand.includes(searchBrand) || (searchBrand === 'indosat' && pBrand.includes('isat'));
            });
        }

        res.json({ status: 'success', data: products });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal load price list' });
    }
});

// 🔹 ROUTE CHECKOUT (POST)
app.post('/api/digiflazz/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no } = req.body;
        const refId = `ARC-${Date.now()}`;
        const sign = crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + refId).digest('hex');

        const response = await axios.post('https://api.digiflazz.com/v1/transaction', {
            username: USERNAME_DIGI,
            buyer_sku_code: buyer_sku_code,
            customer_no: customer_no,
            ref_id: refId,
            sign: sign
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json({ status: 'success', data: response.data.data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal transaksi' });
    }
});

const fs = require('fs');
const MEMBER_FILE = path.join(__dirname, 'members.json');

// Helper Baca & Tulis File JSON Member
const getMembers = () => {
    if (!fs.existsSync(MEMBER_FILE)) fs.writeFileSync(MEMBER_FILE, '[]', 'utf8');
    try {
        return JSON.parse(fs.readFileSync(MEMBER_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
};

const saveMembers = (data) => {
    fs.writeFileSync(MEMBER_FILE, JSON.stringify(data, null, 2), 'utf8');
};

// 1. ROUTE GET ALL MEMBERS
app.get('/api/member/list', (req, res) => {
    const members = getMembers();
    res.json({ status: 'success', data: members });
});

// 2. ROUTE REGISTER MEMBER BARU
app.post('/api/member/register', (req, res) => {
    try {
        const { nama, hp, markup } = req.body;
        if (!nama || !hp) {
            return res.status(400).json({ status: 'error', message: 'Nama dan No. HP wajib diisi' });
        }

        const members = getMembers();
        const newId = `M-${String(members.length + 1).padStart(3, '0')}`;
        
        const newMember = {
            id: newId,
            nama: nama,
            hp: hp,
            saldo: 0,
            markup: parseInt(markup) || 0,
            createdAt: new Date().toISOString()
        };

        members.push(newMember);
        saveMembers(members);

        res.json({ status: 'success', message: 'Member berhasil didaftarkan', data: newMember });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal meragister member' });
    }
});

// 3. ROUTE TOPUP SALDO MEMBER (TANPA MEMOTONG SALDO UTAMA)
app.post('/api/member/topup', (req, res) => {
    try {
        const { id, nominal } = req.body;
        const addNominal = parseInt(nominal);

        if (!id || isNaN(addNominal) || addNominal <= 0) {
            return res.status(400).json({ status: 'error', message: 'ID Member atau Nominal tidak valid' });
        }

        const members = getMembers();
        const memberIndex = members.findIndex(m => m.id === id);

        if (memberIndex === -1) {
            return res.status(404).json({ status: 'error', message: 'Member tidak ditemukan' });
        }

        // Tambahkan saldo ke member tanpa mengganggu saldo utama
        members[memberIndex].saldo += addNominal;
        saveMembers(members);

        res.json({ 
            status: 'success', 
            message: `Berhasil menambah saldo Rp ${addNominal.toLocaleString('id-ID')} ke ${members[memberIndex].nama}`,
            data: members[memberIndex] 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah saldo member' });
    }
});

// 🔹 ROUTE LOGIN AKUN AGEN
app.post('/api/auth/login', (req, res) => {
    const { hp, pin } = req.body;

    // Untuk demo/keamanan awal, PIN bawaan admin diset ke "123456"
    // Bisa disesuaikan nanti dengan database agen
    if (pin === "123456") {
        return res.json({
            status: 'success',
            message: 'Login Berhasil',
            data: {
                nama: 'Sahabat Arcell',
                hp: hp || '081234567890',
                role: 'Owner / Admin Agen',
                token: 'ARC-TOKEN-' + Date.now()
            }
        });
    } else {
        return res.status(400).json({
            status: 'error',
            message: 'PIN / Password salah! (Default: 123456)'
        });
    }
});


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika aktif di Port ${PORT}`);
});

