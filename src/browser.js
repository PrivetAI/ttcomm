const puppeteer = require('puppeteer-core');

class TikTokBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async connect() {
        try {
            console.log('🔌 Connecting to Chrome...');
            
            // Option 1: Direct WebSocket endpoint
            if (process.env.CHROME_WS_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserWSEndpoint: process.env.CHROME_WS_ENDPOINT,
                    defaultViewport: null
                });
            } 
            // Option 2: HTTP endpoint (auto-discover)
            else if (process.env.CHROME_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserURL: process.env.CHROME_ENDPOINT,
                    defaultViewport: null
                });
            } 
            else {
                throw new Error('No Chrome endpoint configured. Set CHROME_WS_ENDPOINT or CHROME_ENDPOINT in .env');
            }

            console.log('✅ Connected to Chrome');
            
            // Get existing pages or create new one
            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();
            
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            console.log('\n📌 To connect to Chrome:');
            console.log('1. Close all Chrome instances');
            console.log('2. Run: google-chrome --remote-debugging-port=9222');
            console.log('3. Check http://localhost:9222/json/version for WebSocket URL');
            console.log('4. Update .env with the browserWSEndpoint\n');
            throw error;
        }
    }

    async checkLogin() {
        await this.page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2' });
        await this.page.waitForTimeout(2000);
        
        const loginButton = await this.page.$('button[data-e2e="top-login-button"]');
        return !loginButton;
    }

    async *scrollFeed(feedType = 'foryou', hashtags = []) {
        const url = feedType === 'hashtag' && hashtags.length > 0
            ? `https://www.tiktok.com/tag/${hashtags[0]}`
            : 'https://www.tiktok.com/foryou';
            
        await this.page.goto(url, { waitUntil: 'networkidle2' });
        await this.page.waitForTimeout(3000);
        
        let processed = new Set();
        let scrollCount = 0;
        
        while (scrollCount < 50) {
            const videos = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('[data-e2e="recommend-list-item"]')).map(el => {
                    const link = el.querySelector('a[href*="/video/"]');
                    const author = el.querySelector('[data-e2e="video-author-uniqueid"]');
                    const desc = el.querySelector('[data-e2e="video-desc"]');
                    
                    if (!link || !author) return null;
                    
                    return {
                        id: link.href.split('/').pop(),
                        url: link.href,
                        author: author.textContent.trim(),
                        description: desc ? desc.textContent.trim() : ''
                    };
                }).filter(Boolean);
            });
            
            for (const video of videos) {
                if (!processed.has(video.id)) {
                    processed.add(video.id);
                    yield video;
                }
            }
            
            await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await this.page.waitForTimeout(2000);
            scrollCount++;
        }
    }

    async postComment(videoUrl, text) {
        try {
            await this.page.goto(videoUrl, { waitUntil: 'networkidle2' });
            await this.page.waitForTimeout(3000);
            
            // Click comment input
            await this.page.click('[data-e2e="comment-input"]');
            await this.page.waitForTimeout(500);
            
            // Type comment
            await this.page.keyboard.type(text, { delay: 100 });
            await this.page.waitForTimeout(1000);
            
            // Post comment
            await this.page.click('[data-e2e="comment-post"]');
            await this.page.waitForTimeout(2000);
            
            return true;
        } catch (error) {
            console.error('Comment error:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.browser) {
            await this.browser.disconnect();
            console.log('🔌 Disconnected from Chrome');
        }
    }
}

module.exports = TikTokBrowser;