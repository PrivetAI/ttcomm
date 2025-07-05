const OpenAI = require('openai');

class AI {
    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async analyzeVideo(video) {
        try {
            const prompt = `
Analyze if this TikTok video is relevant for promoting a job search automation service.

Video: @${video.author}
Description: ${video.description || 'No description'}

Target audience: Job seekers, people tired of manual applications, career changers

Return JSON: {
    "relevant": true/false,
    "score": 0.0-1.0,
    "reason": "brief explanation",
    "category": "work/motivation/humor/other"
}`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            return JSON.parse(response.choices[0].message.content);
        } catch (error) {
            console.error('Analysis error:', error);
            return { relevant: false, score: 0, reason: "Error", category: "other" };
        }
    }

    async generateComment(video, analysis) {
        try {
            const styles = {
                personal: ["I went through the same...", "Been there too..."],
                helpful: ["Try automating the process", "There are tools for that"],
                question: ["Ever tried automation?", "How many hours on applications?"],
                support: ["Keep going!", "You got this!"]
            };

            const style = analysis.category === 'work' ? 'helpful' : 'support';

            const prompt = `
Generate a natural TikTok comment (max 100 chars) that subtly hints at job search automation.

Video: ${video.description}
Style: ${style}

Rules:
- Natural, conversational
- NO direct ads or links
- NO words: bot, service, AI, automated
- Light hint at saving time/efficiency

Return JSON: {
    "comment": "your comment text",
    "confidence": 0.0-1.0
}`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(response.choices[0].message.content);
            
            // Safety check
            if (result.comment.length > 120) {
                result.comment = result.comment.substring(0, 117) + '...';
            }
            
            return result;
        } catch (error) {
            console.error('Comment generation error:', error);
            return { comment: "Great video! 👍", confidence: 0.5 };
        }
    }
}

module.exports = AI;