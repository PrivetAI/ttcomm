const OpenAI = require('openai');

class CommentGenerator {
    constructor(openaiKey) {
        this.openai = new OpenAI({ apiKey: openaiKey });
        
        // Стили комментариев с примерами
        this.commentStyles = {
            personal_experience: {
                description: "Личный опыт",
                examples: [
                    "я тоже так думал, пока не попробовал автоматизировать",
                    "сам через это прошел, теперь время экономлю",
                    "у меня та же история была с откликами"
                ]
            },
            helpful_tip: {
                description: "Полезный совет",
                examples: [
                    "кстати, для откликов есть крутые инструменты",
                    "попробуй автоматизировать рутину, реально помогает",
                    "есть способ сэкономить время на поиске работы"
                ]
            },
            question: {
                description: "Вопрос с подтекстом",
                examples: [
                    "а ты пробовал автоматизировать отклики?",
                    "интересно, сколько времени уходит на отклики?",
                    "кто-нибудь использует AI для поиска работы?"
                ]
            },
            support: {
                description: "Поддержка",
                examples: [
                    "держись! главное - оптимизировать процесс поиска",
                    "все получится! попробуй новые подходы к откликам",
                    "понимаю тебя, сам искал работу месяцами"
                ]
            },
            humor: {
                description: "Юмор",
                examples: [
                    "отклики отправлять - это новый вид спорта 😅",
                    "hh должен платить за время в их приложении",
                    "робот бы справился с откликами лучше меня 🤖"
                ]
            }
        };
    }

    async generateComment(videoData, analysisResult) {
        try {
            // Выбираем подходящий стиль на основе анализа
            const style = this.selectCommentStyle(videoData, analysisResult);
            
            const prompt = this.buildGenerationPrompt(videoData, analysisResult, style);
            
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [
                    {
                        role: "system",
                        content: "Ты мастер естественных комментариев в TikTok. Пишешь кратко, по-человечески, с эмоциями. Никакой явной рекламы."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 200,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            // Постобработка комментария
            return this.postProcessComment(result);
        } catch (error) {
            console.error('❌ Ошибка генерации комментария:', error);
            return this.getFallbackComment(videoData);
        }
    }

    selectCommentStyle(videoData, analysisResult) {
        // Логика выбора стиля на основе контента
        const category = analysisResult.content_category;
        const engagement = analysisResult.engagement_potential;
        
        if (category === 'work' && videoData.description?.toLowerCase().includes('устал')) {
            return 'personal_experience';
        }
        
        if (category === 'motivation') {
            return Math.random() > 0.5 ? 'support' : 'helpful_tip';
        }
        
        if (category === 'humor') {
            return 'humor';
        }
        
        if (engagement === 'high') {
            return 'question';
        }
        
        // По умолчанию - полезный совет
        return 'helpful_tip';
    }

    buildGenerationPrompt(videoData, analysisResult, style) {
        const styleExamples = this.commentStyles[style].examples.join('\n- ');
        
        return `
Сгенерируй естественный комментарий для видео в TikTok.

Контекст видео:
- Описание: ${videoData.description || 'Без описания'}
- Автор: @${videoData.author}
- Категория контента: ${analysisResult.content_category}
- Причина релевантности: ${analysisResult.reason}

Стиль комментария: ${this.commentStyles[style].description}
Примеры стиля:
- ${styleExamples}

Рекламируемый сервис: AI для автоматических откликов на HeadHunter

КРИТИЧЕСКИ ВАЖНЫЕ требования:
1. Максимум 100-120 символов (это очень важно!)
2. Естественный, разговорный язык
3. БЕЗ прямых ссылок на сервис
4. БЕЗ слов "бот", "автоматический", "сервис", "AI"
5. Легкий намек на автоматизацию/экономию времени
6. Соответствие тону видео
7. Используй эмодзи умеренно (0-2 штуки)
8. Пиши на том языке, на котором описание видео

Запрещенные слова: реклама, промо, спам, бот, сервис, ссылка, скачать, установить

Хорошие примеры:
- "тоже искал работу месяцами, пока не начал умнее подходить к откликам 💡"
- "знакомо... я теперь трачу на отклики 5 минут вместо часов"
- "а представь если бы отклики сами отправлялись? 🚀"

Плохие примеры:
- "Попробуй наш сервис для откликов!" (явная реклама)
- "Переходи по ссылке в профиле" (спам)
- "Бот поможет с откликами" (прямое упоминание)

Ответь в JSON формате:
{
    "comment": "текст комментария",
    "style": "${style}",
    "confidence": 0.0-1.0,
    "tone": "friendly|casual|supportive|humorous",
    "risk_level": "low|medium|high"
}`;
    }

    postProcessComment(result) {
        // Проверка длины
        if (result.comment.length > 150) {
            result.comment = result.comment.substring(0, 147) + '...';
        }
        
        // Проверка на запрещенные слова
        const bannedWords = ['реклама', 'промо', 'спам', 'бот', 'сервис', 'ссылка', 'скачать', 'установить'];
        const lowerComment = result.comment.toLowerCase();
        
        for (const word of bannedWords) {
            if (lowerComment.includes(word)) {
                console.warn(`⚠️ Обнаружено запрещенное слово: ${word}`);
                result.risk_level = 'high';
            }
        }
        
        // Добавляем вариативность с эмодзи
        if (Math.random() < 0.3 && !result.comment.includes('😂') && !result.comment.includes('🤣')) {
            const emojis = ['💪', '✨', '🎯', '⚡', '🔥', '👍'];
            result.comment += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
        }
        
        return result;
    }

    getFallbackComment(videoData) {
        // Запасные комментарии на случай ошибки
        const fallbacks = [
            {
                comment: "Интересный подход! 👍",
                style: "support",
                confidence: 0.5,
                tone: "friendly",
                risk_level: "low"
            },
            {
                comment: "Согласен, время - самый ценный ресурс",
                style: "helpful_tip",
                confidence: 0.5,
                tone: "casual",
                risk_level: "low"
            },
            {
                comment: "Тоже через это проходил...",
                style: "personal_experience",
                confidence: 0.5,
                tone: "supportive",
                risk_level: "low"
            }
        ];
        
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // Генерация нескольких вариантов для A/B тестирования
    async generateVariants(videoData, analysisResult, count = 3) {
        const variants = [];
        const styles = Object.keys(this.commentStyles);
        
        for (let i = 0; i < count; i++) {
            const style = styles[i % styles.length];
            const variant = await this.generateComment(
                videoData, 
                { ...analysisResult, _forceStyle: style }
            );
            variants.push(variant);
            
            // Небольшая пауза между запросами
            if (i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Выбираем лучший вариант по confidence
        return variants.sort((a, b) => b.confidence - a.confidence)[0];
    }
}

module.exports = CommentGenerator;