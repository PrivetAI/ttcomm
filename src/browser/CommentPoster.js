class CommentPoster {
    constructor(page) {
        this.page = page;
    }

    async postComment(videoUrl, commentText) {
        try {
            console.log(`💬 Публикация комментария на ${videoUrl}`);
            
            // Переход на страницу видео
            await this.page.goto(videoUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Ждем загрузки видео
            await this.page.waitForSelector('video', { timeout: 10000 });
            
            // Небольшая пауза для имитации просмотра
            await this.randomDelay(3000, 5000);
            
            // Ищем поле для комментария
            const commentInputSelector = '[data-e2e="comment-input"]';
            await this.page.waitForSelector(commentInputSelector, { timeout: 10000 });
            
            // Кликаем на поле ввода
            await this.page.click(commentInputSelector);
            await this.randomDelay(500, 1000);
            
            // Вводим текст комментария с человеческой скоростью
            await this.typeHumanLike(commentText);
            
            // Ждем появления кнопки отправки
            const postButtonSelector = '[data-e2e="comment-post"]';
            await this.page.waitForSelector(postButtonSelector, { 
                visible: true, 
                timeout: 5000 
            });
            
            // Небольшая пауза перед отправкой
            await this.randomDelay(1000, 2000);
            
            // Отправляем комментарий
            await this.page.click(postButtonSelector);
            
            // Ждем подтверждения публикации
            await this.waitForCommentPosted(commentText);
            
            console.log('✅ Комментарий опубликован');
            
            // Пауза после публикации
            await this.randomDelay(10000, 15000);
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка публикации комментария:', error);
            
            // Делаем скриншот для отладки
            await this.page.screenshot({ 
                path: `./logs/comment-error-${Date.now()}.png`,
                fullPage: true 
            });
            
            return false;
        }
    }

    async typeHumanLike(text) {
        // Разбиваем текст на части для более естественного ввода
        const words = text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            // Вводим слово
            for (const char of word) {
                await this.page.keyboard.type(char, {
                    delay: this.randomInt(50, 150)
                });
                
                // Иногда делаем микропаузы
                if (Math.random() < 0.1) {
                    await this.randomDelay(100, 300);
                }
            }
            
            // Пробел после слова (если не последнее)
            if (i < words.length - 1) {
                await this.page.keyboard.press('Space');
                await this.randomDelay(50, 150);
            }
            
            // Иногда делаем паузы между словами
            if (Math.random() < 0.2) {
                await this.randomDelay(200, 500);
            }
        }
    }

    async waitForCommentPosted(commentText) {
        try {
            // Ждем появления нашего комментария в списке
            await this.page.waitForFunction(
                (text) => {
                    const comments = document.querySelectorAll('[data-e2e="comment-text"]');
                    return Array.from(comments).some(comment => 
                        comment.textContent.includes(text)
                    );
                },
                { timeout: 10000 },
                commentText
            );
        } catch (error) {
            console.warn('⚠️ Не удалось подтвердить публикацию комментария');
        }
    }

    async checkForCaptcha() {
        // Проверка на капчу
        const captchaSelectors = [
            '[class*="captcha"]',
            '[id*="captcha"]',
            'iframe[src*="captcha"]',
            '[class*="verify"]'
        ];
        
        for (const selector of captchaSelectors) {
            const captcha = await this.page.$(selector);
            if (captcha) {
                console.warn('⚠️ Обнаружена капча!');
                return true;
            }
        }
        
        return false;
    }

    async handleRateLimit() {
        console.log('⏳ Обнаружен rate limit, ждем...');
        // Длительная пауза при обнаружении ограничений
        await this.randomDelay(60000, 120000); // 1-2 минуты
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async randomDelay(min, max) {
        const delay = this.randomInt(min, max);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

module.exports = CommentPoster;