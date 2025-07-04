const TikTokBrowser = require('./browser/TikTokBrowser');
const CommentPoster = require('./browser/CommentPoster');
const VideoAnalyzer = require('./ai/VideoAnalyzer');
const CommentGenerator = require('./ai/CommentGenerator');
const { 
    VideoModel, 
    CommentModel, 
    SessionModel, 
    SettingsModel,
    ActionLogModel 
} = require('./database/models');
const winston = require('winston');

class TikTokBot {
    constructor() {
        this.browser = null;
        this.poster = null;
        this.analyzer = null;
        this.generator = null;
        this.isRunning = false;
        this.sessionId = null;
        this.stats = {
            videosAnalyzed: 0,
            relevantVideos: 0,
            commentsPosted: 0,
            commentsFailed: 0
        };
        
        // Настройка логгера
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
                })
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/bot.log' })
            ]
        });
    }

    async initialize() {
        try {
            this.logger.info('🚀 Инициализация бота...');
            
            // Инициализация браузера
            this.browser = new TikTokBrowser({
                headless: process.env.HEADLESS_MODE === 'true'
            });
            await this.browser.initialize();
            
            // Проверка авторизации
            const isLoggedIn = await this.browser.checkLoginStatus();
            if (!isLoggedIn) {
                this.logger.warn('⚠️ Требуется авторизация');
                await this.browser.manualLogin();
            }
            
            this.poster = new CommentPoster(this.browser.page);
            
            // Инициализация AI
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY не установлен');
            }
            
            this.analyzer = new VideoAnalyzer(process.env.OPENAI_API_KEY);
            this.generator = new CommentGenerator(process.env.OPENAI_API_KEY);
            
            await this.analyzer.initialize();
            
            this.logger.info('✅ Бот инициализирован');
            return true;
        } catch (error) {
            this.logger.error(`❌ Ошибка инициализации: ${error.message}`);
            throw error;
        }
    }

    async start(config = {}) {
        try {
            // Настройки по умолчанию
            const settings = {
                feedType: config.feedType || 'general',
                hashtags: config.hashtags || [],
                minRelevanceScore: parseFloat(await SettingsModel.get('min_relevance_score') || '0.7'),
                commentDelay: parseInt(await SettingsModel.get('comment_delay_seconds') || '10'),
                videoDelayMin: parseInt(await SettingsModel.get('video_process_delay_min') || '3'),
                videoDelayMax: parseInt(await SettingsModel.get('video_process_delay_max') || '8'),
                maxCommentsPerHour: parseInt(await SettingsModel.get('max_comments_per_hour') || '30')
            };
            
            // Создаем сессию
            this.sessionId = await SessionModel.create({
                feed_type: settings.feedType,
                target_hashtags: settings.hashtags.join(', ')
            });
            
            await ActionLogModel.log(this.sessionId, 'session_start', settings);
            
            this.isRunning = true;
            this.logger.info(`📱 Запуск бота (Сессия #${this.sessionId})`);
            this.logger.info(`⚙️ Настройки: ${JSON.stringify(settings)}`);
            
            // Счетчик для ограничения комментариев
            let commentsThisHour = 0;
            let hourStartTime = Date.now();
            
            // Основной цикл
            for await (const video of this.browser.scrollFeed(settings.feedType, settings.hashtags)) {
                if (!this.isRunning) {
                    this.logger.info('🛑 Остановка по запросу');
                    break;
                }
                
                try {
                    // Проверяем, не обработано ли уже это видео
                    const existingVideo = await VideoModel.getByTikTokId(video.tiktok_id);
                    if (existingVideo) {
                        this.logger.info(`⏭️ Видео ${video.tiktok_id} уже обработано`);
                        continue;
                    }
                    
                    // Сохраняем видео в БД
                    const videoId = await VideoModel.create(video);
                    this.stats.videosAnalyzed++;
                    
                    this.logger.info(`\n📹 Анализ видео от @${video.author}`);
                    this.logger.info(`   "${video.description?.substring(0, 50)}..."`);
                    
                    // Анализ релевантности
                    const analysis = await this.analyzer.analyzeRelevance(video);
                    await VideoModel.updateRelevance(videoId, analysis);
                    
                    await ActionLogModel.log(this.sessionId, 'video_analyzed', {
                        video_id: videoId,
                        author: video.author,
                        relevant: analysis.is_relevant,
                        score: analysis.relevance_score
                    });
                    
                    this.logger.info(`   Релевантность: ${(analysis.relevance_score * 100).toFixed(0)}%`);
                    
                    if (analysis.is_relevant && analysis.relevance_score >= settings.minRelevanceScore) {
                        this.stats.relevantVideos++;
                        
                        // Проверяем лимит комментариев
                        const currentTime = Date.now();
                        if (currentTime - hourStartTime > 3600000) {
                            commentsThisHour = 0;
                            hourStartTime = currentTime;
                        }
                        
                        if (commentsThisHour >= settings.maxCommentsPerHour) {
                            this.logger.warn('⚠️ Достигнут лимит комментариев в час');
                            await this.randomDelay(3600000 - (currentTime - hourStartTime));
                            commentsThisHour = 0;
                            hourStartTime = Date.now();
                        }
                        
                        // Генерация комментария
                        this.logger.info('💬 Генерация комментария...');
                        const comment = await this.generator.generateComment(video, analysis);
                        
                        this.logger.info(`   Комментарий: "${comment.comment}"`);
                        this.logger.info(`   Стиль: ${comment.style}, Риск: ${comment.risk_level}`);
                        
                        // Публикация только если низкий риск
                        if (comment.risk_level !== 'high') {
                            const success = await this.poster.postComment(video.url, comment.comment);
                            
                            // Сохраняем результат
                            await CommentModel.create({
                                video_id: videoId,
                                comment_text: comment.comment,
                                generated_style: comment.style,
                                confidence_score: comment.confidence,
                                success: success,
                                error_message: success ? null : 'Не удалось опубликовать'
                            });
                            
                            await ActionLogModel.log(this.sessionId, 'comment_posted', {
                                video_id: videoId,
                                comment: comment.comment,
                                success: success
                            });
                            
                            if (success) {
                                this.stats.commentsPosted++;
                                commentsThisHour++;
                                this.logger.info('✅ Комментарий опубликован');
                                
                                // Задержка после комментария
                                await this.randomDelay(settings.commentDelay * 1000, settings.commentDelay * 1500);
                            } else {
                                this.stats.commentsFailed++;
                                this.logger.error('❌ Ошибка публикации комментария');
                                
                                // Проверка на капчу
                                if (await this.poster.checkForCaptcha()) {
                                    this.logger.warn('🔐 Обнаружена капча, пауза...');
                                    await this.randomDelay(300000, 600000); // 5-10 минут
                                }
                            }
                        } else {
                            this.logger.warn('⚠️ Комментарий отклонен из-за высокого риска');
                        }
                    }
                    
                    // Обновляем статистику сессии
                    await SessionModel.update(this.sessionId, {
                        videos_analyzed: this.stats.videosAnalyzed,
                        relevant_videos: this.stats.relevantVideos,
                        comments_posted: this.stats.commentsPosted,
                        comments_failed: this.stats.commentsFailed
                    });
                    
                    // Пауза между видео
                    await this.randomDelay(
                        settings.videoDelayMin * 1000,
                        settings.videoDelayMax * 1000
                    );
                    
                } catch (error) {
                    this.logger.error(`❌ Ошибка обработки видео: ${error.message}`);
                    await ActionLogModel.log(this.sessionId, 'error', {
                        error: error.message,
                        video: video
                    });
                    
                    // Пауза при ошибке
                    await this.randomDelay(10000, 20000);
                }
            }
            
            await this.stop('completed');
            
        } catch (error) {
            this.logger.error(`❌ Критическая ошибка: ${error.message}`);
            await this.stop('error', error.message);
            throw error;
        }
    }

    async stop(status = 'stopped', errorMessage = null) {
        this.isRunning = false;
        
        if (this.sessionId) {
            await SessionModel.end(this.sessionId, status, errorMessage);
            await ActionLogModel.log(this.sessionId, 'session_end', {
                status: status,
                stats: this.stats
            });
        }
        
        if (this.browser) {
            await this.browser.close();
        }
        
        this.logger.info(`\n📊 Статистика сессии:`);
        this.logger.info(`   Видео проанализировано: ${this.stats.videosAnalyzed}`);
        this.logger.info(`   Релевантных видео: ${this.stats.relevantVideos}`);
        this.logger.info(`   Комментариев опубликовано: ${this.stats.commentsPosted}`);
        this.logger.info(`   Комментариев с ошибкой: ${this.stats.commentsFailed}`);
        this.logger.info(`\n🔚 Бот остановлен (${status})`);
    }

    async randomDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        this.logger.debug(`⏱️ Пауза ${(delay / 1000).toFixed(1)} сек...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Методы для управления извне
    async pause() {
        this.isRunning = false;
        this.logger.info('⏸️ Бот поставлен на паузу');
    }

    async resume() {
        this.isRunning = true;
        this.logger.info('▶️ Бот возобновлен');
    }

    getStats() {
        return {
            sessionId: this.sessionId,
            isRunning: this.isRunning,
            ...this.stats
        };
    }
}

// Экспорт для использования в других модулях
module.exports = TikTokBot;

// Запуск если вызван напрямую
if (require.main === module) {
    const bot = new TikTokBot();
    
    // Обработка сигналов для корректного завершения
    process.on('SIGINT', async () => {
        console.log('\n⚠️ Получен сигнал остановки...');
        await bot.stop('interrupted');
        process.exit(0);
    });
    
    // Запуск
    (async () => {
        try {
            await bot.initialize();
            
            // Читаем параметры из командной строки
            const config = {
                feedType: process.argv.includes('--hashtag') ? 'hashtag' : 'general',
                hashtags: []
            };
            
            // Извлекаем хештеги
            const hashtagIndex = process.argv.indexOf('--hashtag');
            if (hashtagIndex !== -1 && process.argv[hashtagIndex + 1]) {
                config.hashtags = process.argv[hashtagIndex + 1].split(',').map(h => h.trim());
            }
            
            await bot.start(config);
        } catch (error) {
            console.error('❌ Ошибка:', error);
            process.exit(1);
        }
    })();
}