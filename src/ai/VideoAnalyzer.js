const OpenAI = require('openai');
const { SettingsModel } = require('../database/models');

class VideoAnalyzer {
    constructor(openaiKey) {
        this.openai = new OpenAI({ apiKey: openaiKey });
        this.targetService = null;
        this.initialized = false;
    }

    async initialize() {
        // Загружаем описание сервиса из настроек
        this.targetService = await SettingsModel.get('target_service_description') || 
            "AI-сервис автоматических откликов на вакансии HeadHunter";
        this.initialized = true;
    }

    async analyzeRelevance(videoData) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const prompt = this.buildAnalysisPrompt(videoData);
            
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [
                    {
                        role: "system",
                        content: "Ты эксперт по анализу контента и целевой аудитории. Твоя задача - определить релевантность видео для продвижения сервиса. Отвечай только в формате JSON."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            // Валидация результата
            return this.validateAnalysisResult(result);
        } catch (error) {
            console.error('❌ Ошибка анализа видео:', error);
            return this.getDefaultAnalysisResult();
        }
    }

    buildAnalysisPrompt(videoData) {
        return `
Проанализируй видео из TikTok и определи, подходит ли оно для естественной рекламы сервиса автоматических откликов на вакансии.

Данные видео:
- Автор: ${videoData.author}
- Описание: ${videoData.description || 'Без описания'}
- Хештеги: ${videoData.hashtags || 'Без хештегов'}
- Музыка: ${videoData.music_title || 'Не указана'}
- Лайки: ${videoData.likes_count}
- Комментарии: ${videoData.comments_count}

Целевой сервис: ${this.targetService}

Целевая аудитория сервиса:
- Люди в активном поиске работы
- Специалисты, уставшие от рутинных откликов
- Те, кто ценит время и автоматизацию
- Люди 20-45 лет любых профессий
- Те, кто часто пользуется hh.ru

ВАЖНО: Видео считается релевантным, если:
1. Содержит темы: поиск работы, карьера, безработица, собеседования, резюме, hh/headhunter
2. Говорит о рутине, автоматизации, экономии времени
3. Мотивационный контент о изменении жизни, новых возможностях
4. Жалобы на сложность поиска работы или отклики
5. Юмор про работу, начальников, офис

НЕ релевантно:
- Развлекательный контент без связи с работой
- Детский контент
- Политика, новости
- Продажа товаров

Ответь в формате JSON:
{
    "is_relevant": true/false,
    "relevance_score": 0.0-1.0,
    "reason": "краткое объяснение почему релевантно/нерелевантно",
    "target_audience_match": "описание совпадения с ЦА",
    "content_category": "work|motivation|automation|humor|other",
    "engagement_potential": "high|medium|low"
}`;
    }

    validateAnalysisResult(result) {
        // Проверяем наличие всех полей
        const requiredFields = [
            'is_relevant', 'relevance_score', 'reason', 
            'target_audience_match', 'content_category', 'engagement_potential'
        ];

        for (const field of requiredFields) {
            if (!(field in result)) {
                console.warn(`⚠️ Отсутствует поле ${field} в результате анализа`);
                return this.getDefaultAnalysisResult();
            }
        }

        // Валидация значений
        result.is_relevant = Boolean(result.is_relevant);
        result.relevance_score = Math.max(0, Math.min(1, parseFloat(result.relevance_score) || 0));

        // Проверка категории
        const validCategories = ['work', 'motivation', 'automation', 'humor', 'other'];
        if (!validCategories.includes(result.content_category)) {
            result.content_category = 'other';
        }

        // Проверка потенциала вовлечения
        const validEngagement = ['high', 'medium', 'low'];
        if (!validEngagement.includes(result.engagement_potential)) {
            result.engagement_potential = 'low';
        }

        return result;
    }

    getDefaultAnalysisResult() {
        return {
            is_relevant: false,
            relevance_score: 0,
            reason: "Не удалось проанализировать видео",
            target_audience_match: "Неопределено",
            content_category: "other",
            engagement_potential: "low"
        };
    }

    // Дополнительный метод для пакетного анализа
    async analyzeBatch(videos, concurrency = 3) {
        const results = [];
        
        // Обрабатываем видео пачками для оптимизации
        for (let i = 0; i < videos.length; i += concurrency) {
            const batch = videos.slice(i, i + concurrency);
            const batchPromises = batch.map(video => this.analyzeRelevance(video));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Небольшая пауза между пачками
            if (i + concurrency < videos.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return results;
    }

    // Анализ трендов для оптимизации таргетинга
    async analyzeTrends(recentVideos) {
        const relevantVideos = recentVideos.filter(v => v.is_relevant);
        
        if (relevantVideos.length < 5) {
            return null;
        }

        try {
            const prompt = `
Проанализируй паттерны в успешных релевантных видео и дай рекомендации.

Релевантные видео:
${relevantVideos.map(v => `- ${v.description} (хештеги: ${v.hashtags})`).join('\n')}

Дай краткие рекомендации в JSON:
{
    "trending_topics": ["тема1", "тема2"],
    "effective_hashtags": ["#хештег1", "#хештег2"],
    "best_time_to_comment": "время_суток",
    "recommended_approach": "описание подхода"
}`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [
                    { role: "system", content: "Ты эксперт по анализу трендов в социальных сетях." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 300,
                response_format: { type: "json_object" }
            });

            return JSON.parse(completion.choices[0].message.content);
        } catch (error) {
            console.error('❌ Ошибка анализа трендов:', error);
            return null;
        }
    }
}

module.exports = VideoAnalyzer;