require('dotenv').config();
const TikTokBrowser = require('./browser/TikTokBrowser');
const CommentPoster = require('./browser/CommentPoster');

async function testBrowser() {
    const browser = new TikTokBrowser({
        headless: false // Для визуального дебага
    });

    try {
        // Инициализация
        await browser.initialize();
        
        // Проверяем, нужна ли авторизация
        const isLoggedIn = await browser.checkLoginStatus();
        
        if (!isLoggedIn) {
            console.log('⚠️  Требуется авторизация');
            
            if (process.argv.includes('--manual-login')) {
                await browser.manualLogin();
            } else if (process.env.TIKTOK_USERNAME && process.env.TIKTOK_PASSWORD) {
                await browser.login(
                    process.env.TIKTOK_USERNAME,
                    process.env.TIKTOK_PASSWORD
                );
            } else {
                console.log('❌ Не авторизован. Используйте --manual-login для ручного входа');
                process.exit(1);
            }
        } else {
            console.log('✅ Уже авторизован (cookies загружены)');
        }
        
        // Тест скроллинга ленты
        console.log('\n📋 Тестирование скроллинга ленты...\n');
        
        let videoCount = 0;
        const maxVideos = 5; // Для теста берем только 5 видео
        
        for await (const video of browser.scrollFeed('general')) {
            videoCount++;
            
            console.log(`\n📹 Видео #${videoCount}:`);
            console.log(`   Автор: @${video.author}`);
            console.log(`   ID: ${video.tiktok_id}`);
            console.log(`   Описание: ${video.description?.substring(0, 50)}...`);
            console.log(`   Хештеги: ${video.hashtags}`);
            console.log(`   Лайки: ${video.likes_count}`);
            console.log(`   Комментарии: ${video.comments_count}`);
            console.log(`   URL: ${video.url}`);
            
            if (videoCount >= maxVideos) break;
        }
        
        // Тест публикации комментария
        if (process.argv.includes('--test-comment')) {
            console.log('\n💬 Тестирование публикации комментария...\n');
            
            const testVideoUrl = process.argv[process.argv.indexOf('--test-comment') + 1];
            if (testVideoUrl && testVideoUrl.includes('tiktok.com')) {
                const poster = new CommentPoster(browser.page);
                const testComment = 'Отличное видео! 👍';
                
                const success = await poster.postComment(testVideoUrl, testComment);
                console.log(`Результат: ${success ? 'Успешно' : 'Ошибка'}`);
            } else {
                console.log('❌ Укажите URL видео после --test-comment');
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        // Пауза перед закрытием для визуального контроля
        console.log('\n⏸️  Нажмите Ctrl+C для завершения...');
        await new Promise(() => {}); // Бесконечное ожидание
    }
}

// Запуск тестов
console.log('🚀 Запуск тестов TikTok браузера...\n');
console.log('Использование:');
console.log('  node src/test-browser.js                    - тест скроллинга');
console.log('  node src/test-browser.js --manual-login     - ручная авторизация');
console.log('  node src/test-browser.js --test-comment URL - тест комментария\n');

testBrowser();