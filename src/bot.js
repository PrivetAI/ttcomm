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
                
                // Analyze
                const analysis = await this.ai.analyzeVideo(video);
                await db.updateVideoRelevance(videoId, analysis);
                
                console.log(`   Relevant: ${analysis.relevant ? 'YES' : 'NO'} (${(analysis.score * 100).toFixed(0)}%)`);
                
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
                    
                    // Generate comment
                    const comment = await this.ai.generateComment(video, analysis);
                    console.log(`💬 Comment: "${comment.comment}"`);
                    
                    // Post comment
                    const success = await this.browser.postComment(video.url, comment.comment);
                    await db.saveComment(videoId, comment.comment, success);
                    
                    if (success) {
                        this.stats.comments++;
                        hourlyComments++;
                        console.log('✅ Posted successfully');
                        await this.wait(commentDelay);
                    } else {
                        console.log('❌ Failed to post');
                    }
                }
                
                // Update session stats
                await db.updateSession(this.sessionId, this.stats);
                
                // Random delay between videos
                await this.wait(this.random(3000, 8000));
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
        feedType: process.argv.includes('--hashtag') ? 'hashtag' : 'foryou',
        hashtags: []
    };
    
    const hashtagIndex = process.argv.indexOf('--hashtag');
    if (hashtagIndex !== -1 && process.argv[hashtagIndex + 1]) {
        config.hashtags = process.argv[hashtagIndex + 1].split(',');
    }
    
    bot.start(config);
}

module.exports = Bot;   