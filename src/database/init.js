const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/tiktok_bot.db');
const dbDir = path.dirname(dbPath);

// Создаем директорию если не существует
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const initDatabase = () => {
    db.serialize(() => {
        // Таблица видео
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

        // Таблица комментариев
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

        // Таблица сессий бота
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

        // Таблица настроек
        db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица логов действий
        db.run(`
            CREATE TABLE IF NOT EXISTS action_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER REFERENCES bot_sessions(id),
                action_type TEXT NOT NULL,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Индексы для производительности
        db.run('CREATE INDEX IF NOT EXISTS idx_videos_tiktok_id ON videos(tiktok_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_videos_relevant ON videos(is_relevant)');
        db.run('CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_sessions_status ON bot_sessions(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_logs_session ON action_logs(session_id)');

        // Начальные настройки
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

        stmt.finalize();

        console.log('✅ База данных инициализирована');
        
        // Выводим информацию о таблицах
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err) {
                console.error('❌ Ошибка:', err);
            } else {
                console.log('\n📊 Созданные таблицы:');
                tables.forEach(table => {
                    console.log(`   - ${table.name}`);
                });
            }
        });
    });
};

// Запуск инициализации
console.log('🔧 Инициализация базы данных...');
console.log(`📁 Путь к БД: ${dbPath}`);

initDatabase();

// Закрываем соединение после завершения
db.close((err) => {
    if (err) {
        console.error('❌ Ошибка при закрытии БД:', err);
    } else {
        console.log('\n✅ Инициализация завершена');
    }
});