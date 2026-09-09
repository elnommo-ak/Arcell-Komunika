require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, 'public')));

// Import Routes
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const okeconnectRoutes = require('./routes/okeconnect');
const digiflazzRoutes = require('./routes/digiflazz');

// Register Routes
app.use('/api', clientRoutes);
app.use('/api', adminRoutes);
app.use('/api/okeconnect', okeconnectRoutes);
app.use('/api/digiflazz', digiflazzRoutes);

// Alias Callback OkeConnect untuk kompatibilitas webhook lama
app.use('/callback/okeconnect', okeconnectRoutes);

// Servis Halaman Admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server Arcell Komunika berjalan di Port ${PORT}`);
});

