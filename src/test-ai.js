require('dotenv').config();
const VideoAnalyzer = require('./ai/VideoAnalyzer');
const CommentGenerator = require('./ai/CommentGenerator');

async function testAI() {
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ Установите OPENAI_API_KEY в файле .env');
        process.exit(1);
    }

    const analyzer = new VideoAnalyzer(process.env.OPENAI_API_KEY);
    const generator = new CommentGenerator(process.env.OPENAI_API_KEY);

    // Тестовые видео
    const testVideos = [
        {
            tiktok_id: '123456',
            author: 'jobseeker123',
            description: 'День 45 поиска работы... Отправил уже 200 откликов на hh, а ответов ноль. Устал уже от этой рутины 😢',
            hashtags: '#работа #поискработы #hh #устал',
            likes_count: 1500,
            comments_count: 89
        },
        {
            tiktok_id: '789012',
            author: 'motivation_daily',
            description: 'Не сдавайся! Каждый отказ приближает тебя к работе мечты. Главное - оптимизировать процесс и не тратить время зря',
            hashtags: '#мотивация #карьера #успех',
            likes_count: 5200,
            comments_count: 234
        },
        {
            tiktok_id: '345678',
            author: 'funny_office',
            description: 'Когда в 100й раз заполняешь одну и ту же анкету на сайте работодателя 🤡',
            hashtags: '#юмор #работа #офис #рутина',
            likes_count: 8900,
            comments_count: 567
        },
        {
            tiktok_id: '901234',
            author: 'dance_queen',
            description: 'Новый танец под трек Моргенштерна 🔥🔥🔥',
            hashtags: '#танцы #моргенштерн #тренд',
            likes_count: 25000,
            comments_count: 1200
        }
    ];

    console.log('🧪 Тестирование AI модулей\n');
    console.log('=' .repeat(50));

    for (const video of testVideos) {
        console.log(`\n📹 Видео от @${video.author}`);
        console.log(`📝 "${video.description}"`);
        console.log(`🏷️  ${video.hashtags}`);
        console.log(`❤️  ${video.likes_count} | 💬 ${video.comments_count}`);
        
        // Анализ релевантности
        console.log('\n🔍 Анализ релевантности...');
        const analysis = await analyzer.analyzeRelevance(video);
        
        console.log(`✅ Релевантно: ${analysis.is_relevant ? 'ДА' : 'НЕТ'}`);
        console.log(`📊 Оценка: ${(analysis.relevance_score * 100).toFixed(0)}%`);
        console.log(`📋 Причина: ${analysis.reason}`);
        console.log(`🎯 Категория: ${analysis.content_category}`);
        console.log(`⚡ Потенциал: ${analysis.engagement_potential}`);
        
        // Генерация комментария если релевантно
        if (analysis.is_relevant && analysis.relevance_score > 0.5) {
            console.log('\n💬 Генерация комментария...');
            const comment = await generator.generateComment(video, analysis);
            
            console.log(`💭 Комментарий: "${comment.comment}"`);
            console.log(`🎨 Стиль: ${comment.style}`);
            console.log(`🎭 Тон: ${comment.tone}`);
            console.log(`⚠️  Риск: ${comment.risk_level}`);
            console.log(`📏 Длина: ${comment.comment.length} символов`);
            
            // Тест генерации вариантов
            if (process.argv.includes('--variants')) {
                console.log('\n🔄 Генерация вариантов...');
                const variants = await generator.generateVariants(video, analysis, 3);
                console.log(`🏆 Лучший вариант: "${variants.comment}"`);
            }
        }
        
        console.log('\n' + '-'.repeat(50));
    }

    // Тест анализа трендов
    if (process.argv.includes('--trends')) {
        console.log('\n📈 Анализ трендов...');
        const relevantVideos = testVideos.map((v, i) => ({
            ...v,
            is_relevant: i < 3 // Первые 3 видео релевантны
        }));
        
        const trends = await analyzer.analyzeTrends(relevantVideos);
        if (trends) {
            console.log('🔥 Трендовые темы:', trends.trending_topics);
            console.log('#️⃣  Эффективные хештеги:', trends.effective_hashtags);
            console.log('🕐 Лучшее время:', trends.best_time_to_comment);
            console.log('💡 Рекомендации:', trends.recommended_approach);
        }
    }

    console.log('\n✅ Тестирование завершено');
}

// Запуск
console.log('🚀 Запуск тестов AI модулей\n');
console.log('Использование:');
console.log('  node src/test-ai.js              - базовый тест');
console.log('  node src/test-ai.js --variants   - с генерацией вариантов');
console.log('  node src/test-ai.js --trends     - с анализом трендов\n');

testAI().catch(console.error);