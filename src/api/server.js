require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { initializeDatabase, closeDatabase } = require('../database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// API routes
app.use('/api', routes);

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Запуск сервера
const startServer = async () => {
    try {
        await initializeDatabase();
        const server = app.listen(PORT, () => {
            console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
            console.log(`📊 Панель управления: http://localhost:${PORT}`);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n⚠️ Получен сигнал ${signal}, начинаю корректное завершение...`);
            server.close(async () => {
                console.log('🔌 HTTP-сервер закрыт.');
                try {
                    await closeDatabase();
                    console.log('✅ Корректное завершение выполнено.');
                    process.exit(0);
                } catch (error) {
                    console.error('❌ Ошибка при закрытии БД:', error);
                    process.exit(1);
                }
            });
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    } catch (error) {
        console.error('❌ Не удалось запустить сервер:', error);
        process.exit(1);
    }
};

startServer();
