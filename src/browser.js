const AutomationFactory = require('./automation/AutomationFactory');

/**
 * Browser Manager using pluggable automation strategies
 */
class BrowserManager {
    constructor() {
        this.strategy = null;
        this.isConnected = false;
        this.captchaDetected = false;
        this.currentPlatform = 'tiktok';
    }

    /**
     * Connect using specified automation strategy
     * @param {string} strategyType - Type of automation (direct, mcp, llm)
     * @param {Object} config - Strategy configuration
     */
    async connect(strategyType = 'direct', config = {}) {
        try {
            console.log(`🔌 Initializing ${strategyType} automation...`);
            
            // Create strategy
            this.strategy = AutomationFactory.create(strategyType, config);
            
            // Initialize
            await this.strategy.initialize();
            
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Auto-select best available strategy and connect
     */
    async connectBest(config = {}) {
        try {
            console.log('🔌 Auto-selecting best automation strategy...');
            
            this.strategy = await AutomationFactory.createBestAvailable(config);
            await this.strategy.initialize();
            
            console.log(`✅ Connected using ${this.strategy.getName()}`);
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            throw error;
        }
    }

    async checkLogin() {
        if (!this.isConnected || !this.strategy) {
            throw new Error('Not connected');
        }
        
        console.log('🌐 Checking TikTok login...');
        await this.strategy.navigate('https://www.tiktok.com');
        const loggedIn = await this.strategy.checkLogin();
        console.log(loggedIn ? '✅ TikTok logged in' : '⚠️ TikTok not logged in');
        
        return loggedIn;
    }

    async *scrollFeed() {
        if (!this.strategy) {
            throw new Error('No automation strategy initialized');
        }
        
        console.log('📱 Scrolling TikTok feed...');
        
        // Navigate to main feed if not there
        const currentUrl = await this.strategy.executeScript(() => window.location.href);
        if (!currentUrl.includes('foryou') && !currentUrl.match(/tiktok\.com\/?$/)) {
            await this.strategy.navigate('https://www.tiktok.com');
            await this.wait(3000);
        }
        
        // Yield videos from feed
        yield* this.scroll();
    }

    async *scrollSearch(searchQuery) {
        if (!this.strategy) {
            throw new Error('No automation strategy initialized');
        }
        
        // Navigate to search
        await this.strategy.searchTikTok(searchQuery);
        
        // Add initial delay
        await this.wait(this.randomDelay(2000, 5000));
        
        // Yield videos from scroll
        yield* this.scroll();
    }


    async *scroll() {
        let processed = new Set();
        let attempts = 0;
        let noNewVideosCount = 0;
        
        try {
            while (attempts < 100 && noNewVideosCount < 5) {
                attempts++;
                
                // Check for captcha
                if (await this.strategy.checkForCaptcha()) {
                    console.log('⏸️ CAPTCHA detected - waiting for manual solve...');
                    this.captchaDetected = true;
                    await this.wait(5000);
                    continue;
                } else {
                    this.captchaDetected = false;
                }
                
                // Extract videos
                const videos = await this.strategy.extractVideos();
                
                let foundNew = false;
                for (const video of videos) {
                    if (!processed.has(video.id)) {
                        processed.add(video.id);
                        foundNew = true;
                        noNewVideosCount = 0;
                        yield video;
                    }
                }
                
                if (!foundNew) {
                    noNewVideosCount++;
                    console.log(`⚠️ No new videos found (${noNewVideosCount}/5)`);
                }
                
                // Scroll to next
                await this.strategy.scrollToNext();
                await this.wait(2000);
            }
        } finally {
            console.log(`📊 Scroll session complete: ${processed.size} videos found`);
        }
    }

    async getVideoDetails(video) {
        return await this.strategy.getVideoDetails();
    }

    async getComments(video, limit = 50) {
        return await this.strategy.getComments(limit);
    }

    async postComment(video, text) {
        return await this.strategy.postComment(text);
    }

    getCaptchaStatus() {
        return this.captchaDetected;
    }

    async stopScrolling() {
        // Strategy handles its own cleanup
        console.log('⏹️ Stopping scroll session');
    }

    async disconnect() {
        if (this.strategy) {
            await this.strategy.disconnect();
            this.strategy = null;
            this.isConnected = false;
        }
    }

    /**
     * Get current strategy info
     */
    getStrategyInfo() {
        if (!this.strategy) {
            return null;
        }
        
        return {
            name: this.strategy.getName(),
            description: this.strategy.getDescription(),
            capabilities: this.strategy.getCapabilities()
        };
    }

    /**
     * Switch to a different automation strategy
     */
    async switchStrategy(newStrategyType, config = {}) {
        console.log(`🔄 Switching to ${newStrategyType} strategy...`);
        
        // Disconnect current
        if (this.strategy) {
            await this.disconnect();
        }
        
        // Connect new
        await this.connect(newStrategyType, config);
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

module.exports = BrowserManager;