const fs = require('fs');
const path = require('path');

// Создаем необходимые директории
const dirs = ['logs', 'data', 'screenshots'];

dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Создана директория: ${dir}/`);
    }
});

console.log('📁 Все директории готовы');