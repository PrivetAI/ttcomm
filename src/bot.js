require('dotenv').config();
const BrowserManager = require('./browser');
const AI = require('./ai');
const db = require('./db');
const StealthFeatures = require('./stealth');

class Bot {
    constructor() {
        this.browser = new BrowserManager();
        this.ai = new AI();
        this.stealth = new StealthFeatures();
        this.isRunning = false;
        this.sessionId = null;
        this.stats = { videos: 0, comments: 0 };
        this.sessionStartTime = Date.now();
        this.lastAction = null;
        this.scrollMode = 'search'; // 'search' or 'feed'
    }

    setAction(action) {
        this.lastAction = action;
        console.log(action);
    }

    async start(config = {}) {
        try {
            // Set scroll mode
            this.scrollMode = config.scrollMode || 'search';
            
            // Connect to browser
            this.setAction('🔌 Connecting to Chrome...');
            await this.browser.connect();
            
            // Check login
            this.setAction('🔐 Checking TikTok login...');
            const isLoggedIn = await this.browser.checkLogin();
            if (!isLoggedIn) {
                this.setAction('❌ Please log in to TikTok in Chrome first!');
                throw new Error('Not logged in to TikTok');
            }
            
            this.setAction('✅ Logged in to TikTok');
            
            // Create session
            this.sessionId = await db.createSession();
            this.isRunning = true;
            this.sessionStartTime = Date.now();
            
            // Get settings
            const minScore = parseFloat(await db.getSetting('min_relevance_score'));
            const commentDelay = parseInt(await db.getSetting('comment_delay_seconds')) * 1000;
            const maxPerHour = parseInt(await db.getSetting('max_comments_per_hour'));
            
            let hourlyComments = 0;
            let hourStart = Date.now();
            
            // Initial delay
            this.setAction(`🎬 Starting ${this.scrollMode === 'feed' ? 'feed' : 'search'} session...`);
            await this.stealth.humanDelay('reading');
            
            // Process videos based on mode
            while (this.isRunning) {
                // Session duration check
                const sessionDuration = Date.now() - this.sessionStartTime;
                if (sessionDuration > 2 * 60 * 60 * 1000) {
                    this.setAction('⏰ Session time limit reached (2 hours)');
                    break;
                }
                
                // Get video iterator based on mode
                let videoIterator;
                if (this.scrollMode === 'feed') {
                    videoIterator = this.browser.scrollFeed();
                } else {
                    if (!config.searchQuery) {
                        throw new Error('Search query required for search mode');
                    }
                    videoIterator = this.browser.scrollSearch(config.searchQuery);
                }
                
                const { value: video, done } = await videoIterator.next();
                
                if (done || !video) {
                    this.setAction('⏹️ No more videos');
                    break;
                }
                
                // Skip if already processed
                if (await db.isVideoProcessed(video.id)) {
                    this.setAction(`⏭️ Already processed: @${video.author}`);
                    continue;
                }
                
                // Save video
                const videoId = await db.saveVideo(video);
                this.stats.videos++;
                
                this.setAction(`📹 Video ${this.stats.videos} from @${video.author}`);
                
                // Check for captcha
                if (this.browser.getCaptchaStatus()) {
                    this.setAction('⏸️ CAPTCHA detected - waiting for manual solve...');
                    await this.stealth.wait(5000);
                    continue;
                }
                
                // Simulate watching
                await this.simulateWatching();
                
                // Get video details
                this.setAction('📊 Getting video engagement...');
                const videoDetails = await this.browser.getVideoDetails();
                
                if (videoDetails) {
                    this.setAction(`💙 ${videoDetails.counts.likes} likes | 💬 ${videoDetails.counts.comments} comments`);
                }
                
                // Get comments
                this.setAction('💬 Reading video comments...');
                const comments = await this.browser.getComments(30);
                this.setAction(`📝 Found ${comments.length} comments to analyze`);
                
                // Always analyze video (removed skip logic)
                this.setAction('🤖 AI analyzing video relevance...');
                const analysis = await this.ai.analyzeVideoWithComments(video, comments, videoDetails);
                await db.updateVideoRelevance(videoId, analysis);
                
                this.setAction(`📈 Relevance: ${analysis.relevant ? 'YES' : 'NO'} (${(analysis.score * 100).toFixed(0)}%) - Category: ${analysis.category}`);
                
                if (analysis.relevant && analysis.score >= minScore) {
                    // Check hourly limit
                    if (Date.now() - hourStart > 3600000) {
                        hourlyComments = 0;
                        hourStart = Date.now();
                    }
                    
                    if (hourlyComments >= maxPerHour) {
                        this.setAction('⏸️ Hourly comment limit reached - taking a break');
                        const waitTime = 3600000 - (Date.now() - hourStart);
                        await this.stealth.wait(waitTime);
                        hourlyComments = 0;
                        hourStart = Date.now();
                    }
                    
                    // Generate comment
                    this.setAction('✍️ AI generating contextual comment...');
                    const comment = await this.ai.generateContextualComment(
                        video, 
                        analysis, 
                        comments.slice(0, 10)
                    );
                    
                    this.setAction(`💬 Comment ready: "${comment.comment}"`);
                    
                    // Extra delay
                    await this.stealth.humanDelay('beforeComment');
                    
                    // Post comment
                    this.setAction('📤 Posting comment...');
                    const success = await this.browser.postComment(comment.comment);
                    await db.saveComment(videoId, comment.comment, success);
                    
                    if (success) {
                        this.stats.comments++;
                        hourlyComments++;
                        this.setAction('✅ Comment posted successfully!');
                        
                        // Delay after commenting
                        await this.stealth.wait(commentDelay);
                    } else {
                        this.setAction('❌ Failed to post comment');
                    }
                } else {
                    this.setAction('⏭️ Video not relevant enough for commenting');
                }
                
                // Update session stats
                await db.updateSession(this.sessionId, this.stats);
                
                // Human-like delay
                await this.stealth.humanDelay('scrolling');
            }
            
        } catch (error) {
            this.setAction(`❌ Bot error: ${error.message}`);
            throw error;
        } finally {
            await this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        this.setAction('⏹️ Stopping bot...');
        
        await this.browser.stopScrolling();
        
        if (this.sessionId) {
            await db.endSession(this.sessionId, 'stopped');
        }
        
        await this.browser.disconnect();
        
        const sessionDuration = Math.round((Date.now() - this.sessionStartTime) / 1000 / 60);
        
        this.setAction(`📊 Session complete - ${sessionDuration}m, ${this.stats.videos} videos, ${this.stats.comments} comments`);
    }

    async simulateWatching() {
        const watchTime = this.stealth.randomDelay(5000, 15000);
        this.setAction(`👀 Watching video for ${Math.round(watchTime/1000)}s...`);
        
        if (this.stealth.shouldRandomizeAction(0.1)) {
            await this.stealth.wait(watchTime / 2);
            await this.stealth.wait(watchTime / 2);
        } else {
            await this.stealth.wait(watchTime);
        }
    }

    wait(ms) {
        return this.stealth.wait(ms);
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
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const searchQuery = args.filter(arg => !arg.startsWith('--')).join(' ') || 'remote work tips';
    const scrollMode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'search';
    
    console.log(`🔍 Starting bot in ${scrollMode} mode`);
    if (scrollMode === 'search') {
        console.log(`🔍 Search query: "${searchQuery}"`);
    }
    
    bot.start({ 
        searchQuery,
        scrollMode
    });
}

module.exports = Bot;