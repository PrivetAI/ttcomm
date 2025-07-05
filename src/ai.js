const OpenAI = require('openai');

class AI {
    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async analyzeVideoWithComments(video, comments, videoDetails) {
        try {
            // Prepare comment analysis
            const topComments = comments.slice(0, 20).map(c => ({
                text: c.text,
                likes: parseInt(c.likes) || 0,
                sentiment: this.quickSentiment(c.text)
            }));

            const prompt = `
Analyze this TikTok video and its comments to determine if it's suitable for a job search automation service comment.

Video Information:
- Author: @${video.author}
- Description: ${video.description || 'No description'}
- Likes: ${videoDetails?.counts?.likes || 'N/A'}
- Comments: ${videoDetails?.counts?.comments || 'N/A'}
- Shares: ${videoDetails?.counts?.shares || 'N/A'}

Top Comments Analysis:
${JSON.stringify(topComments, null, 2)}

Comment Themes:
- Job search frustration mentioned: ${topComments.some(c => /job|work|application|apply|resume|interview/i.test(c.text))}
- Automation/tools mentioned: ${topComments.some(c => /automat|tool|app|software|bot/i.test(c.text))}
- Negative sentiment about process: ${topComments.filter(c => c.sentiment === 'negative').length}/${topComments.length}

Target audience: Job seekers, people tired of manual applications, career changers

Analyze:
1. Video relevance to job search/career topics
2. Comment section sentiment and themes
3. Whether our comment would fit naturally
4. Risk of seeming spammy in this context

Return JSON: {
    "relevant": true/false,
    "score": 0.0-1.0,
    "reason": "brief explanation",
    "category": "work/motivation/humor/career/other",
    "commentContext": {
        "mainTheme": "what people are discussing",
        "sentiment": "positive/negative/mixed",
        "engagementLevel": "high/medium/low",
        "suggestedApproach": "empathy/solution/question/support"
    }
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
            return { 
                relevant: false, 
                score: 0, 
                reason: "Error", 
                category: "other",
                commentContext: {
                    mainTheme: "unknown",
                    sentiment: "mixed",
                    engagementLevel: "low",
                    suggestedApproach: "support"
                }
            };
        }
    }

    async generateContextualComment(video, analysis, topComments) {
        try {
            // Analyze what makes successful comments in this thread
            const popularComments = topComments
                .filter(c => parseInt(c.likes) > 10)
                .slice(0, 5);

            const prompt = `
Generate a natural TikTok comment that fits this specific conversation.

Video: ${video.description}
Video Category: ${analysis.category}
Comment Section Theme: ${analysis.commentContext.mainTheme}
Overall Sentiment: ${analysis.commentContext.sentiment}
Suggested Approach: ${analysis.commentContext.suggestedApproach}

Popular comments in thread:
${popularComments.map(c => `"${c.text}" (${c.likes} likes)`).join('\n')}

Chain of Thought:
1. The video is about ${analysis.category} and people are discussing ${analysis.commentContext.mainTheme}
2. The sentiment is ${analysis.commentContext.sentiment}, so I should be ${analysis.commentContext.suggestedApproach === 'empathy' ? 'understanding' : analysis.commentContext.suggestedApproach === 'solution' ? 'helpful' : 'engaging'}
3. Popular comments are ${popularComments.length > 0 ? 'getting engagement by being relatable' : 'varied'}
4. My comment should naturally fit the conversation flow

Rules:
- Match the tone and style of existing comments
- Be authentic and conversational
- If work/career related, subtly hint at easier ways
- NO direct promotion, links, or obvious advertising
- NO words: bot, service, AI, automated, website, app
- Keep under 100 characters
- Use appropriate emoji if others are using them

Context-specific guidelines:
${analysis.commentContext.suggestedApproach === 'empathy' ? '- Share a relatable experience' : ''}
${analysis.commentContext.suggestedApproach === 'solution' ? '- Hint at a better way without being salesy' : ''}
${analysis.commentContext.suggestedApproach === 'question' ? '- Ask an engaging question that resonates' : ''}
${analysis.commentContext.suggestedApproach === 'support' ? '- Offer encouragement or validation' : ''}

Return JSON: {
    "comment": "your comment text",
    "confidence": 0.0-1.0,
    "reasoning": "why this comment fits the context"
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
            return { 
                comment: "Great video! 👍", 
                confidence: 0.5,
                reasoning: "Fallback comment due to error"
            };
        }
    }

    quickSentiment(text) {
        const positive = /good|great|love|awesome|amazing|best|perfect|excellent|happy/i;
        const negative = /bad|hate|worst|terrible|awful|sucks|annoying|frustrated|tired/i;
        
        if (negative.test(text)) return 'negative';
        if (positive.test(text)) return 'positive';
        return 'neutral';
    }
}

module.exports = AI;