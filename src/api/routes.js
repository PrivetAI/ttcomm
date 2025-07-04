const express = require('express');
const router = express.Router();
const botManager = require('../BotManager');
const { 
    VideoModel, 
    CommentModel, 
    SessionModel, 
    SettingsModel,
    ActionLogModel 
} = require('../database/models');

// Статус бота
router.get('/status', async (req, res) => {
    try {
        const status = botManager.getStatus();
        const currentSession = await botManager.getCurrentSession();
        
        res.json({
            ...status,
            currentSession
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Запуск бота
router.post('/start', async (req, res) => {
    try {
        const { feedType, hashtags } = req.body;
        
        const config = {
            feedType: feedType || 'general',
            hashtags: hashtags ? hashtags.split(',').map(h => h.trim()) : []
        };
        
        const result = await botManager.start(config);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Остановка бота
router.post('/stop', async (req, res) => {
    try {
        const result = await botManager.stop();
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Пауза/возобновление
router.post('/pause', async (req, res) => {
    try {
        const result = await botManager.pause();
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/resume', async (req, res) => {
    try {
        const result = await botManager.resume();
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Статистика
router.get('/stats', async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        
        if (sessionId) {
            const stats = await SessionModel.getStats(sessionId);
            res.json(stats);
        } else {
            // Общая статистика
            const totalStats = await new Promise((resolve, reject) => {
                const db = require('../database/db');
                db.get(`
                    SELECT 
                        COUNT(DISTINCT id) as total_sessions,
                        SUM(videos_analyzed) as total_videos,
                        SUM(comments_posted) as total_comments,
                        AVG(comments_posted * 1.0 / NULLIF(videos_analyzed, 0)) as avg_conversion
                    FROM bot_sessions
                    WHERE status != 'error'
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            res.json(totalStats);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Список видео
router.get('/videos', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const onlyRelevant = req.query.relevant === 'true';
        
        const videos = onlyRelevant 
            ? await VideoModel.getRelevantVideos(limit)
            : await new Promise((resolve, reject) => {
                const db = require('../database/db');
                db.all(
                    'SELECT * FROM videos ORDER BY processed_at DESC LIMIT ?',
                    [limit],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Список комментариев
router.get('/comments', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const comments = await CommentModel.getRecent(limit);
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Настройки
router.get('/settings', async (req, res) => {
    try {
        const settings = await SettingsModel.getAll();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const updates = req.body;
        
        for (const [key, value] of Object.entries(updates)) {
            await SettingsModel.set(key, value);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// История сессий
router.get('/sessions', async (req, res) => {
    try {
        const db = require('../database/db');
        db.all(
            'SELECT * FROM bot_sessions ORDER BY started_at DESC LIMIT 20',
            (err, rows) => {
                if (err) res.status(500).json({ error: err.message });
                else res.json(rows);
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Логи действий
router.get('/logs/:sessionId', async (req, res) => {
    try {
        const logs = await ActionLogModel.getBySession(req.params.sessionId);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;