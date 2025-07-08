require('dotenv').config();
const BrowserManager = require('./browser');
const AI = require('./ai');
const db = require('./db');

class Bot {
    constructor() {
        this.browser = new BrowserManager();
        this.ai = new AI();
        this.isRunning = false;
        this.sessionId = null;
        this.stats = { videos: 0, comments: 0 };
        this.currentPlatform = 'tiktok'; // Start with TikTok
    }

    async start(config = {}) {
        try {
            // Connect to Chrome
            await this.browser.connect();
            
            // Check login on both platforms
            const isLoggedIn = await this.browser.checkLogin();
            if (!isLoggedIn) {
                console.log('❌ Please log in to both TikTok and Instagram in Chrome first!');
                return;
            }
            
            console.log('✅ Logged in to both platforms');
            
            // Create session
            this.sessionId = await db.createSession();
            this.isRunning = true;
            
            // Get settings
            const minScore = parseFloat(await db.getSetting('min_relevance_score'));
            const commentDelay = parseInt(await db.getSetting('comment_delay_seconds')) * 1000;
            const maxPerHour = parseInt(await db.getSetting('max_comments_per_hour'));
            
            let hourlyComments = 0;
            let hourStart = Date.now();
            
            // Process videos alternating between platforms
            while (this.isRunning) {
                // Get one video from current platform
                const videoIterator = this.browser.scrollPlatform(
                    this.currentPlatform, 
                    config.feedType, 
                    config.hashtags
                );
                
                const { value: video, done } = await videoIterator.next();
                
                if (done || !video) {
                    console.log(`⏹️ No more videos from ${this.currentPlatform}`);
                    break;
                }
                
                // Skip if already processed
                if (await db.isVideoProcessed(video.id)) {
                    console.log(`⏭️  Skipping processed video: ${video.id}`);
                    // Switch platform and continue
                    this.currentPlatform = this.currentPlatform === 'tiktok' ? 'instagram' : 'tiktok';
                    continue;
                }
                
                // Save video with platform
                const videoId = await db.saveVideo(video);
                this.stats.videos++;
                
                console.log(`\n📹 [${video.platform.toUpperCase()}] Video from @${video.author}`);
                console.log(`   "${video.description?.substring(0, 50)}..."`);
                
                // Check for captcha
                if (this.browser.getCaptchaStatus()) {
                    console.log('⏸️ Waiting for captcha to be solved...');
                    await this.wait(5000);
                    continue;
                }
                
                // Get video details
                console.log('   📊 Getting video details...');
                const videoDetails = await this.browser.getVideoDetails(video);
                
                if (videoDetails) {
                    console.log(`   💙 ${videoDetails.counts.likes} | 💬 ${videoDetails.counts.comments} | 🔄 ${videoDetails.counts.shares}`);
                }
                
                // Get comments for analysis
                console.log('   💬 Loading comments...');
                const comments = await this.browser.getComments(video, 50);
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
                    const success = await this.browser.postComment(video, comment.comment);
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
                
                // Switch platform for next video
                // this.currentPlatform = this.currentPlatform === 'tiktok' ? 'instagram' : 'tiktok';
                // console.log(`   🔄 Switching to ${this.currentPlatform.toUpperCase()}`);
                
                // Small delay before next video (no long delay between platforms)
                await this.wait(1000);
            }
            
        } catch (error) {
            console.error('❌ Bot error:', error);
        } finally {
            await this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        
        // Stop scrolling on both platforms
        await this.browser.stopScrolling();
        
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

    getCaptchaStatus() {
        return this.browser.getCaptchaStatus();
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