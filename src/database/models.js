const { getDb } = require('./db');

class VideoModel {
    static async create(videoData) {
        return new Promise((resolve, reject) => {
            const {
                tiktok_id, author, description, hashtags, music_title,
                url, views_count, likes_count, comments_count, shares_count
            } = videoData;

            const query = `
                INSERT OR IGNORE INTO videos 
                (tiktok_id, author, description, hashtags, music_title, url, 
                 views_count, likes_count, comments_count, shares_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            getDb().run(query, [
                tiktok_id, author, description, hashtags, music_title,
                url, views_count, likes_count, comments_count, shares_count
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async updateRelevance(videoId, analysisResult) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE videos 
                SET is_relevant = ?, 
                    relevance_score = ?, 
                    relevance_reason = ?,
                    target_audience_match = ?
                WHERE id = ?
            `;

            getDb().run(query, [
                analysisResult.is_relevant ? 1 : 0,
                analysisResult.relevance_score,
                analysisResult.reason,
                analysisResult.target_audience_match,
                videoId
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async getById(id) {
        return new Promise((resolve, reject) => {
            getDb().get('SELECT * FROM videos WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async getByTikTokId(tiktokId) {
        return new Promise((resolve, reject) => {
            getDb().get('SELECT * FROM videos WHERE tiktok_id = ?', [tiktokId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async getRelevantVideos(limit = 10) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM videos 
                WHERE is_relevant = 1 
                ORDER BY processed_at DESC 
                LIMIT ?
            `;
            getDb().all(query, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

class CommentModel {
    static async create(commentData) {
        return new Promise((resolve, reject) => {
            const {
                video_id, comment_text, generated_style, 
                confidence_score, success, error_message
            } = commentData;

            const query = `
                INSERT INTO comments 
                (video_id, comment_text, generated_style, confidence_score, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            getDb().run(query, [
                video_id, comment_text, generated_style, 
                confidence_score, success ? 1 : 0, error_message
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async getByVideoId(videoId) {
        return new Promise((resolve, reject) => {
            getDb().all('SELECT * FROM comments WHERE video_id = ?', [videoId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getRecent(limit = 20) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT c.*, v.author, v.description, v.url
                FROM comments c
                JOIN videos v ON c.video_id = v.id
                ORDER BY c.posted_at DESC
                LIMIT ?
            `;
            getDb().all(query, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

class SessionModel {
    static async create(sessionData) {
        return new Promise((resolve, reject) => {
            const { feed_type, target_hashtags } = sessionData;

            const query = `
                INSERT INTO bot_sessions (feed_type, target_hashtags)
                VALUES (?, ?)
            `;

            getDb().run(query, [feed_type, target_hashtags], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async update(sessionId, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(sessionId);

            const query = `UPDATE bot_sessions SET ${fields} WHERE id = ?`;

            getDb().run(query, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async end(sessionId, status = 'completed', errorMessage = null) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE bot_sessions 
                SET ended_at = CURRENT_TIMESTAMP, 
                    status = ?,
                    error_message = ?
                WHERE id = ?
            `;

            getDb().run(query, [status, errorMessage, sessionId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async getCurrent() {
        return new Promise((resolve, reject) => {
            getDb().get(
                'SELECT * FROM bot_sessions WHERE status = "running" ORDER BY started_at DESC LIMIT 1',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static async getStats(sessionId) {
        return new Promise((resolve, reject) => {
            getDb().get('SELECT * FROM bot_sessions WHERE id = ?', [sessionId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

class SettingsModel {
    static async get(key) {
        return new Promise((resolve, reject) => {
            getDb().get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            });
        });
    }

    static async set(key, value) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO settings (key, value, updated_at) 
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `;
            
            getDb().run(query, [key, value], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async getAll() {
        return new Promise((resolve, reject) => {
            getDb().all('SELECT * FROM settings', (err, rows) => {
                if (err) reject(err);
                else {
                    const settings = {};
                    rows.forEach(row => {
                        settings[row.key] = row.value;
                    });
                    resolve(settings);
                }
            });
        });
    }
}

class ActionLogModel {
    static async log(sessionId, actionType, details) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO action_logs (session_id, action_type, details)
                VALUES (?, ?, ?)
            `;

            getDb().run(query, [sessionId, actionType, JSON.stringify(details)], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async getBySession(sessionId, limit = 100) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM action_logs 
                WHERE session_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `;
            
            getDb().all(query, [sessionId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = {
    VideoModel,
    CommentModel,
    SessionModel,
    SettingsModel,
    ActionLogModel
};
