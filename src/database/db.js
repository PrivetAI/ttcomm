const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists with proper permissions
const dataDir = path.join(__dirname, '../../data');

const ensureDataDirectory = () => {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
            console.log('📁 Created data directory:', dataDir);
        }
        
        // Check if directory is writable
        fs.accessSync(dataDir, fs.constants.W_OK);
        console.log('✅ Data directory is writable');
        
    } catch (error) {
        console.error('❌ Error with data directory:', error.message);
        
        // Try alternative location if /app/data fails
        const altDataDir = path.join('/tmp', 'tiktok_bot_data');
        if (!fs.existsSync(altDataDir)) {
            fs.mkdirSync(altDataDir, { recursive: true, mode: 0o755 });
        }
        console.log('📁 Using alternative data directory:', altDataDir);
        return altDataDir;
    }
    
    return dataDir;
};

const actualDataDir = ensureDataDirectory();
const dbPath = path.join(actualDataDir, 'tiktok_bot.db');

// Create database connection with better error handling
const createDatabase = () => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err.message);
                console.error('📋 Database path:', dbPath);
                
                // Try to create the file first
                try {
                    fs.writeFileSync(dbPath, '', { mode: 0o644 });
                    console.log('📄 Created empty database file');
                    
                    // Try connecting again
                    const retryDb = new sqlite3.Database(dbPath, (retryErr) => {
                        if (retryErr) {
                            reject(retryErr);
                        } else {
                            console.log('✅ Connected to SQLite database (retry)');
                            resolve(retryDb);
                        }
                    });
                    
                } catch (createError) {
                    console.error('❌ Failed to create database file:', createError.message);
                    reject(createError);
                }
            } else {
                console.log('✅ Connected to SQLite database');
                console.log('📍 Database path:', dbPath);
                resolve(db);
            }
        });
    });
};

// Initialize database
let db;

const initializeDatabase = async () => {
    if (db) {
        return db;
    }
    try {
        db = await createDatabase();
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Create tables
        await createTables();
        
        console.log('📊 Database initialized successfully');
        
        // Update the exported object
        module.exports.db = db;
        
        return db;
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        throw error;
    }
};

const createTables = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Videos table
            db.run(`
                CREATE TABLE IF NOT EXISTS videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tiktok_id TEXT UNIQUE NOT NULL,
                    author TEXT NOT NULL,
                    description TEXT,
                    hashtags TEXT,
                    music_title TEXT,
                    url TEXT NOT NULL,
                    views_count INTEGER,
                    likes_count INTEGER,
                    comments_count INTEGER,
                    shares_count INTEGER,
                    is_relevant BOOLEAN DEFAULT 0,
                    relevance_score REAL,
                    relevance_reason TEXT,
                    target_audience_match TEXT,
                    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Comments table
            db.run(`
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    video_id INTEGER REFERENCES videos(id),
                    comment_text TEXT NOT NULL,
                    generated_style TEXT,
                    confidence_score REAL,
                    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN DEFAULT 1,
                    error_message TEXT
                )
            `);

            // Bot sessions table
            db.run(`
                CREATE TABLE IF NOT EXISTS bot_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME,
                    feed_type TEXT CHECK(feed_type IN ('general', 'hashtag')),
                    target_hashtags TEXT,
                    videos_analyzed INTEGER DEFAULT 0,
                    relevant_videos INTEGER DEFAULT 0,
                    comments_posted INTEGER DEFAULT 0,
                    comments_failed INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'running',
                    error_message TEXT
                )
            `);

            // Settings table
            db.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Action logs table
            db.run(`
                CREATE TABLE IF NOT EXISTS action_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER REFERENCES bot_sessions(id),
                    action_type TEXT NOT NULL,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes
            db.run('CREATE INDEX IF NOT EXISTS idx_videos_tiktok_id ON videos(tiktok_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_videos_relevant ON videos(is_relevant)');
            db.run('CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_sessions_status ON bot_sessions(status)');
            db.run('CREATE INDEX IF NOT EXISTS idx_logs_session ON action_logs(session_id)');

            // Insert default settings
            const defaultSettings = [
                ['min_relevance_score', '0.7'],
                ['comment_delay_seconds', '10'],
                ['video_process_delay_min', '3'],
                ['video_process_delay_max', '8'],
                ['max_comments_per_hour', '30'],
                ['target_service_description', 'AI-сервис автоматических откликов на вакансии HeadHunter']
            ];

            const stmt = db.prepare(`
                INSERT OR REPLACE INTO settings (key, value, updated_at) 
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            defaultSettings.forEach(([key, value]) => {
                stmt.run(key, value);
            });

            stmt.finalize((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('📊 Database tables created successfully');
                    resolve();
                }
            });
        });
    });
};

// Graceful shutdown
const closeDatabase = () => {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                    reject(err);
                } else {
                    console.log('📊 Database closed');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
};

// Process event handlers
process.on('SIGINT', async () => {
    try {
        await closeDatabase();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    try {
        await closeDatabase();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
    }
});

// Export database instance and utilities
module.exports = {
    db: null, // Will be set after initialization
    getDb: () => {
        if (!db) {
            throw new Error('Database not initialized. Call initializeDatabase() first.');
        }
        return db;
    },
    initializeDatabase,
    closeDatabase,
    dbPath
};
