// scripts/clear-db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/bot.db');

['videos', 'comments', 'sessions', 'settings']
  .forEach(table => db.run(`DELETE FROM ${table}`, err => {
    if (err) console.error(`Error clearing ${table}:`, err);
    else console.log(`${table} cleared.`);
  }));

db.close();
