require('dotenv').config();
const TikTokBrowser = require('./browser');
const AI = require('./ai');
const db = require('./db');

class Bot {
    constructor() {
        this.browser = new TikTokBrowser();
        this.ai = new AI();
        this.isRunning = false;
        this.sessionId = null;
        this.stats = { videos: 0, comments: 0 };
    }

    async start(config = {}) {
        try {
            // Connect to Chrome
            await this.browser.connect();
            
            // Check login
            const isLoggedIn = await this.browser.checkLogin();
            if (!isLoggedIn) {
                console.log('❌ Please log in to TikTok in Chrome first!');
                return;
            }
            
            console.log('✅ Logged in to TikTok');
            
            // Create session
            this.sessionId = await db.createSession();
            this.isRunning = true;
            
            // Get settings
            const minScore = parseFloat(await db.getSetting('min_relevance_score'));
            const commentDelay = parseInt(await db.getSetting('comment_delay_seconds')) * 1000;
            const maxPerHour = parseInt(await db.getSetting('max_comments_per_hour'));
            
            let hourlyComments = 0;
            let hourStart = Date.now();
            
            // Process videos
            for await (const video of this.browser.scrollFeed(config.feedType, config.hashtags)) {
                if (!this.isRunning) break;
                
                // Skip if already processed
                if (await db.isVideoProcessed(video.id)) {
                    console.log(`⏭️  Skipping processed video: ${video.id}`);
                    continue;
                }
                
                // Save video
                const videoId = await db.saveVideo(video);
                this.stats.videos++;
                
                console.log(`\n📹 Video from @${video.author}`);
                console.log(`   "${video.description?.substring(0, 50)}..."`);
                
                // Get video details
                console.log('   📊 Getting video details...');
                const videoDetails = await this.browser.getVideoDetails(video.url);
                
                if (videoDetails) {
                    console.log(`   💙 ${videoDetails.counts.likes} | 💬 ${videoDetails.counts.comments} | 🔄 ${videoDetails.counts.shares}`);
                }
                
                // Get comments for analysis
                console.log('   💬 Loading comments...');
                const comments = await this.browser.getComments(video.url, 50);
                console.log(`   📝 Found ${comments.length} comments`);
                
                // Analyze video with comments context
                console.log('   🤔 Analyzing relevance...');
                const analysis = await this.ai.analyzeVideoWithComments(video, comments, videoDetails);
                await db.updateVideoRelevance(videoId, analysis);
                
                console.log(`   📈 Relevant: ${analysis.relevant ? 'YES' : 'NO'} (${(analysis.score * 100).toFixed(0)}%)`);
                console.log(`   🎯 Category: ${analysis.category}`);
                console.log(`   💭 Theme: ${analysis.commentContext.mainTheme}`);
                console.log(`   😊 Sentiment: ${analysis.commentContext.sentiment}`);
                
                if (analysis.relevant && analysis.score >= minScore) {
                    // Check hourly limit
                    if (Date.now() - hourStart > 3600000) {
                        hourlyComments = 0;
                        hourStart = Date.now();
                    }
                    
                    if (hourlyComments >= maxPerHour) {
                        console.log('⏸️  Hourly limit reached, waiting...');
                        await this.wait(3600000 - (Date.now() - hourStart));
                        hourlyComments = 0;
                        hourStart = Date.now();
                    }
                    
                    // Generate contextual comment
                    console.log('   ✍️  Generating contextual comment...');
                    const comment = await this.ai.generateContextualComment(
                        video, 
                        analysis, 
                        comments.slice(0, 10)
                    );
                    
                    console.log(`   💬 Comment: "${comment.comment}"`);
                    console.log(`   🎯 Approach: ${analysis.commentContext.suggestedApproach}`);
                    console.log(`   🔍 Reasoning: ${comment.reasoning}`);
                    
                    // Post comment
                    const success = await this.browser.postComment(video.url, comment.comment);
                    await db.saveComment(videoId, comment.comment, success);
                    
                    if (success) {
                        this.stats.comments++;
                        hourlyComments++;
                        console.log('   ✅ Posted successfully!');
                        await this.wait(commentDelay);
                    } else {
                        console.log('   ❌ Failed to post');
                    }
                } else {
                    console.log(`   ⏭️  Skipping - ${analysis.reason}`);
                }
                
                // Update session stats
                await db.updateSession(this.sessionId, this.stats);
                
                // Random delay between videos
                const delay = this.random(5000, 12000);
                console.log(`   ⏳ Waiting ${(delay/1000).toFixed(1)}s before next video...`);
                await this.wait(delay);
            }
            
        } catch (error) {
            console.error('❌ Bot error:', error);
        } finally {
            await this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        
        if (this.sessionId) {
            await db.endSession(this.sessionId, 'stopped');
        }
        
        await this.browser.disconnect();
        
        console.log('\n📊 Session Stats:');
        console.log(`   Videos analyzed: ${this.stats.videos}`);
        console.log(`   Comments posted: ${this.stats.comments}`);
        console.log(`   Success rate: ${this.stats.videos > 0 ? (this.stats.comments/this.stats.videos*100).toFixed(1) : 0}%`);
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

// Run if called directly
if (require.main === module) {
    const bot = new Bot();
    
    process.on('SIGINT', async () => {
        console.log('\n⏹️  Stopping bot...');
        await bot.stop();
        process.exit(0);
    });
    
    const config = {
        feedType: process.argv.includes('--hashtag') ? 'hashtag' : '',
        hashtags: []
    };
    
    const hashtagIndex = process.argv.indexOf('--hashtag');
    if (hashtagIndex !== -1 && process.argv[hashtagIndex + 1]) {
        config.hashtags = process.argv[hashtagIndex + 1].split(',');
    }
    
    bot.start(config);
}

module.exports = Bot;