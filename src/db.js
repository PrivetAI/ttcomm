const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        const dbDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(path.join(dbDir, 'bot.db'));
        this.init();
    }

    init() {
        this.db.serialize(() => {
            // Videos table with platform column
            this.db.run(`
                CREATE TABLE IF NOT EXISTS videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tiktok_id TEXT UNIQUE,
                    platform TEXT DEFAULT 'tiktok',
                    author TEXT,
                    description TEXT,
                    url TEXT,
                    is_relevant BOOLEAN DEFAULT 0,
                    relevance_score REAL,
                    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Add platform column to existing table if not exists
            this.db.run(`
                ALTER TABLE videos ADD COLUMN platform TEXT DEFAULT 'tiktok'
            `, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding platform column:', err);
                }
            });

            // Comments table  
            this.db.run(`
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    video_id INTEGER,
                    comment_text TEXT,
                    success BOOLEAN DEFAULT 1,
                    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (video_id) REFERENCES videos(id)
                )
            `);

            // Sessions table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME,
                    videos_analyzed INTEGER DEFAULT 0,
                    comments_posted INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'running'
                )
            `);

            // Settings table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `);

            // Default settings
            const defaults = [
                ['min_relevance_score', process.env.MIN_RELEVANCE_SCORE || '0.7'],
                ['comment_delay_seconds', process.env.COMMENT_DELAY_SECONDS || '10'],
                ['max_comments_per_hour', process.env.MAX_COMMENTS_PER_HOUR || '30']
            ];

            const stmt = this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)');
            defaults.forEach(([k, v]) => stmt.run(k, v));
            stmt.finalize();
        });
    }

    // Video methods
    async saveVideo(video) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO videos (tiktok_id, platform, author, description, url) VALUES (?, ?, ?, ?, ?)',
                [video.id, video.platform || 'tiktok', video.author, video.description, video.url],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async updateVideoRelevance(videoId, analysis) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE videos SET is_relevant = ?, relevance_score = ? WHERE id = ?',
                [analysis.relevant ? 1 : 0, analysis.score, videoId],
                err => err ? reject(err) : resolve()
            );
        });
    }

    async isVideoProcessed(tiktokId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id FROM videos WHERE tiktok_id = ?',
                [tiktokId],
                (err, row) => err ? reject(err) : resolve(!!row)
            );
        });
    }

    // Comment methods
    async saveComment(videoId, comment, success) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO comments (video_id, comment_text, success) VALUES (?, ?, ?)',
                [videoId, comment, success ? 1 : 0],
                err => err ? reject(err) : resolve()
            );
        });
    }

    // Session methods
    async createSession() {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO sessions DEFAULT VALUES',
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async updateSession(id, stats) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE sessions SET videos_analyzed = ?, comments_posted = ? WHERE id = ?',
                [stats.videos, stats.comments, id],
                err => err ? reject(err) : resolve()
            );
        });
    }

    async endSession(id, status) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
                [status, id],
                err => err ? reject(err) : resolve()
            );
        });
    }

    // Stats methods with platform support
    async getStats() {
        return new Promise((resolve, reject) => {
            // Get session stats
            this.db.get(`
                SELECT 
                    COUNT(DISTINCT id) as total_sessions,
                    SUM(videos_analyzed) as total_videos_from_sessions,
                    SUM(comments_posted) as total_comments
                FROM sessions
            `, (err, sessionStats) => {
                if (err) return reject(err);
                
                // Get video stats separately
                this.db.get(`
                    SELECT 
                        COUNT(*) as unique_videos,
                        COUNT(CASE WHEN platform = 'tiktok' THEN 1 END) as tiktok_videos,
                        COUNT(CASE WHEN platform = 'instagram' THEN 1 END) as instagram_videos
                    FROM videos
                `, (err, videoStats) => {
                    if (err) return reject(err);
                    
                    resolve({
                        total_sessions: sessionStats.total_sessions || 0,
                        total_videos: videoStats.unique_videos || 0,
                        total_comments: sessionStats.total_comments || 0,
                        tiktok_videos: videoStats.tiktok_videos || 0,
                        instagram_videos: videoStats.instagram_videos || 0
                    });
                });
            });
        });
    }

    async getRecentVideos(limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM videos ORDER BY processed_at DESC LIMIT ?',
                [limit],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
    }

    async getRecentComments(limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT c.*, v.author, v.description, v.url, v.platform
                FROM comments c
                JOIN videos v ON c.video_id = v.id
                ORDER BY c.posted_at DESC
                LIMIT ?
            `, [limit], (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT value FROM settings WHERE key = ?',
                [key],
                (err, row) => err ? reject(err) : resolve(row?.value)
            );
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = new Database();