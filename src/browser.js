const puppeteer = require('puppeteer-core');
const TikTokBrowser = require('./browsers/TikTokBrowser');
const InstagramBrowser = require('./browsers/InstagramBrowser');

class BrowserManager {
    constructor() {
        this.browser = null;
        this.tiktokBrowser = new TikTokBrowser();
        this.instagramBrowser = new InstagramBrowser();
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log('🔌 Connecting to Chrome...');
            
            // Connect to Chrome
            if (process.env.CHROME_WS_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserWSEndpoint: process.env.CHROME_WS_ENDPOINT,
                    defaultViewport: null
                });
            } else if (process.env.CHROME_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserURL: process.env.CHROME_ENDPOINT,
                    defaultViewport: null
                });
            } else {
                throw new Error('No Chrome endpoint configured in .env');
            }
            
            // Set up TikTok tab
            const pages = await this.browser.pages();
            const tiktokPage = pages[0] || await this.browser.newPage();
            await this.tiktokBrowser.setupPage(tiktokPage);
            
            // Create Instagram tab
            const instagramPage = await this.browser.newPage();
            await this.instagramBrowser.setupPage(instagramPage);
            
            console.log('✅ Connected to Chrome with 2 tabs');
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            throw error;
        }
    }

    async checkLogin() {
        if (!this.isConnected) {
            await this.connect();
        }
        
        // Check TikTok login
        console.log('🌐 Checking TikTok login...');
        await this.tiktokBrowser.page.bringToFront();
        await this.tiktokBrowser.navigate();
        const tiktokLoggedIn = await this.tiktokBrowser.checkLogin();
        console.log(tiktokLoggedIn ? '✅ TikTok logged in' : '⚠️ TikTok not logged in');
        
        // // Check Instagram login
        // console.log('🌐 Checking Instagram login...');
        // await this.instagramBrowser.page.bringToFront();
        // await this.instagramBrowser.navigate();
        // const instagramLoggedIn = await this.instagramBrowser.checkLogin();
        // console.log(instagramLoggedIn ? '✅ Instagram logged in' : '⚠️ Instagram not logged in');
        
        // return tiktokLoggedIn && instagramLoggedIn;
        return tiktokLoggedIn

    }

    async *scrollPlatform(platform, feedType = '', hashtags = []) {
        const browser = platform === 'instagram' ? this.instagramBrowser : this.tiktokBrowser;
        
        // Switch to correct tab
        await browser.page.bringToFront();
        
        // Navigate if needed (for hashtags on TikTok)
        if (platform === 'tiktok' && feedType === 'hashtag' && hashtags.length > 0) {
            await browser.navigate(feedType, hashtags);
        }
        
        // Yield videos from the scroll generator
        yield* browser.scroll();
    }

    async getVideoDetails(video) {
        const browser = video.platform === 'instagram' ? this.instagramBrowser : this.tiktokBrowser;
        return await browser.getVideoDetails();
    }

    async getComments(video, limit = 50) {
        const browser = video.platform === 'instagram' ? this.instagramBrowser : this.tiktokBrowser;
        return await browser.getComments(limit);
    }

    async postComment(video, text) {
        const browser = video.platform === 'instagram' ? this.instagramBrowser : this.tiktokBrowser;
        return await browser.postComment(text);
    }

    getCaptchaStatus() {
        return this.tiktokBrowser.getCaptchaStatus() || this.instagramBrowser.getCaptchaStatus();
    }

    async stopScrolling() {
        this.tiktokBrowser.stop();
        this.instagramBrowser.stop();
    }

    async disconnect() {
        await this.stopScrolling();
        if (this.browser) {
            await this.browser.disconnect();
            console.log('🔌 Disconnected from Chrome');
            this.isConnected = false;
        }
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BrowserManager;