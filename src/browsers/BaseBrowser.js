const puppeteer = require('puppeteer-core');

class BaseBrowser {
    constructor() {
        this.page = null;
        this.isRunning = false;
        this.captchaDetected = false;
    }

    async setupPage(page) {
        this.page = page;
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    }

    async checkForCaptcha() {
        const captchaSelectors = [
            '.captcha-slider',
            '#captcha-verify-image',
            '[class*="captcha"]',
            '[id*="captcha"]',
            '.secsdk-captcha-drag-icon',
            '.verify-captcha-slider'
        ];
        
        for (const selector of captchaSelectors) {
            const captcha = await this.page.$(selector);
            if (captcha) {
                const isVisible = await this.page.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, captcha);
                
                if (isVisible) {
                    return true;
                }
            }
        }
        return false;
    }

    async waitForCaptchaSolved() {
        this.captchaDetected = true;
        console.log('🤖 Captcha detected! Waiting for manual solve...');
        
        while (await this.checkForCaptcha()) {
            await this.wait(2000);
        }
        
        this.captchaDetected = false;
        console.log('✅ Captcha solved! Resuming...');
        await this.wait(2000);
    }

    async scrollToNext() {
        // Override in child classes
        throw new Error('scrollToNext must be implemented in child class');
    }

    async *scroll() {
        this.isRunning = true;
        let processed = new Set();
        let attempts = 0;
        let noNewVideosCount = 0;
        
        try {
            while (this.isRunning && attempts < 100 && noNewVideosCount < 5) {
                attempts++;
                
                // Check for captcha
                if (await this.checkForCaptcha()) {
                    await this.waitForCaptchaSolved();
                }
                
                const videos = await this.extractVideos();
                
                let foundNew = false;
                for (const video of videos) {
                    if (!processed.has(video.id) && this.isRunning) {
                        processed.add(video.id);
                        foundNew = true;
                        noNewVideosCount = 0;
                        yield video;
                        break;
                    }
                }
                
                if (!foundNew) {
                    noNewVideosCount++;
                    console.log(`⚠️ No new videos found (${noNewVideosCount}/5)`);
                }
                
                if (this.isRunning) {
                    await this.scrollToNext();
                    await this.wait(2000);
                }
            }
        } finally {
            this.isRunning = false;
        }
    }

    async extractVideos() {
        // Override in child classes
        throw new Error('extractVideos must be implemented in child class');
    }

    async getVideoDetails() {
        // Override in child classes
        throw new Error('getVideoDetails must be implemented in child class');
    }

    async getComments(limit = 50) {
        // Override in child classes
        throw new Error('getComments must be implemented in child class');
    }

    async postComment(text) {
        // Override in child classes
        throw new Error('postComment must be implemented in child class');
    }

    stop() {
        this.isRunning = false;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getCaptchaStatus() {
        return this.captchaDetected;
    }
}

module.exports = BaseBrowser;