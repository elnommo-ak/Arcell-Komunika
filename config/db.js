const sqlite3 = require('sqlite3').verbose();

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

// Helper Promise Wrapper
db.getAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

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

module.exports = db;

