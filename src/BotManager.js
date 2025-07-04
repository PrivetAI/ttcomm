const TikTokBot = require('./bot');
const { SessionModel } = require('./database/models');

class BotManager {
    constructor() {
        this.bot = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (!this.isInitialized) {
            this.bot = new TikTokBot();
            await this.bot.initialize();
            this.isInitialized = true;
        }
    }

    async start(config) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.bot.isRunning) {
            throw new Error('Бот уже запущен');
        }

        // Запускаем в отдельном процессе чтобы не блокировать
        setImmediate(() => {
            this.bot.start(config).catch(error => {
                console.error('Ошибка в боте:', error);
            });
        });

        // Даем время на запуск
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            sessionId: this.bot.sessionId,
            message: 'Бот запущен'
        };
    }

    async stop() {
        if (!this.bot || !this.bot.isRunning) {
            throw new Error('Бот не запущен');
        }

        await this.bot.stop('manual');
        
        return {
            success: true,
            message: 'Бот остановлен'
        };
    }

    async pause() {
        if (!this.bot || !this.bot.isRunning) {
            throw new Error('Бот не запущен');
        }

        await this.bot.pause();
        
        return {
            success: true,
            message: 'Бот поставлен на паузу'
        };
    }

    async resume() {
        if (!this.bot) {
            throw new Error('Бот не инициализирован');
        }

        await this.bot.resume();
        
        return {
            success: true,
            message: 'Бот возобновлен'
        };
    }

    getStatus() {
        if (!this.bot) {
            return {
                isRunning: false,
                isInitialized: false,
                stats: null
            };
        }

        return {
            isRunning: this.bot.isRunning,
            isInitialized: this.isInitialized,
            stats: this.bot.getStats()
        };
    }

    async getCurrentSession() {
        return await SessionModel.getCurrent();
    }

    async getSessionStats(sessionId) {
        return await SessionModel.getStats(sessionId);
    }
}

// Singleton
module.exports = new BotManager();