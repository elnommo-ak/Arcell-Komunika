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
const BASE_URL_DIGI = 'https://api.digiflazz.com/v1';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const generateSign = (cmd) => {
    return crypto.createHash('md5').update(USERNAME_DIGI + API_KEY_DIGI + cmd).digest('hex');
};

// 🔹 ROUTE PRICE-LIST (Sesuai dengan fetch di index.html kamu)
app.post('/api/digiflazz/price-list', async (req, res) => {
    try {
        const { brand } = req.body;
        const sign = generateSign('pricelist');
        
        const response = await axios.post(`${BASE_URL_DIGI}/price-list`, {
            cmd: 'prepaid',
            username: USERNAME_DIGI,
            sign: sign
        });

        let products = response.data.data || [];
        
        // Filter berdasarkan brand/operator jika dikirim
        if (brand) {
            products = products.filter(p => {
                let pBrand = (p.brand || '').toLowerCase();
                let searchBrand = brand.toLowerCase();
                return pBrand.includes(searchBrand) || (searchBrand === 'indosat' && pBrand.includes('isat'));
            });
        }

        res.json({ status: 'success', data: products });
    } catch (error) {
        console.error("Error Price List:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data dari Digiflazz' });
    }
});

// 🔹 ROUTE CHECKOUT / TOPUP (Sesuai dengan fetch di index.html kamu)
app.post('/api/digiflazz/checkout', async (req, res) => {
    try {
        const { buyer_sku_code, customer_no } = req.body;
        const refId = `ARC-${Date.now()}`;
        const sign = generateSign(refId);

        const response = await axios.post(`${BASE_URL_DIGI}/transaction`, {
            username: USERNAME_DIGI,
            buyer_sku_code: buyer_sku_code,
            customer_no: customer_no,
            ref_id: refId,
            sign: sign
        });

        res.json({ status: 'success', data: response.data.data });
    } catch (error) {
        console.error("Error Checkout:", error.message);
        res.status(500).json({ status: 'error', message: 'Transaksi gagal diproses' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika aktif di Port ${PORT}`);
});

