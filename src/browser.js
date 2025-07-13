const puppeteer = require('puppeteer-core');
const StealthFeatures = require('./stealth');

/**
 * Simplified Browser Manager using only direct Puppeteer
 */
class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.stealth = new StealthFeatures();
        this.isConnected = false;
        this.captchaDetected = false;
        this.currentVideoIndex = 0;
    }

    async connect() {
        try {
            console.log('🔌 Connecting to Chrome...');
            
            const chromeArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1366,768',
                '--start-maximized'
            ];
            
            // Connect to Chrome
            if (process.env.CHROME_WS_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserWSEndpoint: process.env.CHROME_WS_ENDPOINT,
                    defaultViewport: null,
                    args: chromeArgs
                });
            } else if (process.env.CHROME_ENDPOINT) {
                this.browser = await puppeteer.connect({
                    browserURL: process.env.CHROME_ENDPOINT,
                    defaultViewport: null,
                    args: chromeArgs
                });
            } else {
                throw new Error('No Chrome endpoint configured');
            }
            
            // Get or create page
            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();
            
            // Apply stealth
            await this.stealth.setupStealthMode(this.page);
            
            this.isConnected = true;
            console.log('✅ Connected to Chrome');
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            throw error;
        }
    }

    async checkLogin() {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        
        console.log('🌐 Checking TikTok login...');
        await this.page.goto('https://www.tiktok.com', { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        const loginButton = await this.page.$('button[data-e2e="top-login-button"], [data-e2e="login-button"]');
        const isLoggedIn = !loginButton;
        
        console.log(isLoggedIn ? '✅ TikTok logged in' : '⚠️ TikTok not logged in');
        return isLoggedIn;
    }

    async *scrollFeed() {
        console.log('📱 Scrolling TikTok feed...');
        
        // Navigate to main feed if not there
        const currentUrl = await this.page.url();
        if (!currentUrl.includes('foryou') && !currentUrl.match(/tiktok\.com\/?$/)) {
            await this.page.goto('https://www.tiktok.com', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            await this.stealth.humanDelay('reading');
        }
        
        // Yield videos from feed
        yield* this.scrollVideos('feed');
    }

    async *scrollSearch(searchQuery) {
        console.log(`🔍 Searching for: "${searchQuery}"`);
        
        // Navigate to search
        const url = `https://www.tiktok.com/search?q=${encodeURIComponent(searchQuery)}`;
        await this.page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        await this.stealth.humanDelay('reading');
        
        // Click on Videos tab
        try {
            const videosTab = await this.page.$('[data-e2e="search-video-tab"], [href*="/search/video"]');
            if (videosTab) {
                await this.stealth.humanMouseMove(this.page, videosTab);
                await this.stealth.humanDelay('beforeClick');
                await videosTab.click();
                await this.stealth.humanDelay('afterClick');
            }
        } catch (error) {
            console.log('Could not find videos tab, continuing anyway');
        }
        
        // Yield videos from search
        yield* this.scrollVideos('search');
    }

    async *scrollVideos(mode) {
        let processed = new Set();
        let attempts = 0;
        let noNewVideosCount = 0;
        
        try {
            while (attempts < 100 && noNewVideosCount < 5) {
                attempts++;
                
                // Check for captcha
                if (await this.checkForCaptcha()) {
                    console.log('⏸️ CAPTCHA detected - waiting for manual solve...');
                    this.captchaDetected = true;
                    await this.stealth.wait(5000);
                    continue;
                } else {
                    this.captchaDetected = false;
                }
                
                if (mode === 'search') {
                    // Extract search results
                    const videos = await this.extractSearchVideos();
                    let foundNew = false;
                    
                    for (const video of videos) {
                        if (!processed.has(video.id)) {
                            processed.add(video.id);
                            foundNew = true;
                            noNewVideosCount = 0;
                            
                            // Navigate to video page
                            console.log(`📹 Opening video from @${video.author}`);
                            await this.navigateToVideo(video);
                            
                            // Extract full video data from the page
                            const fullVideo = await this.extractCurrentVideo();
                            if (fullVideo) {
                                yield fullVideo;
                            }
                            
                            // Go back to search results
                            await this.page.goBack({ waitUntil: 'networkidle2' });
                            await this.stealth.humanDelay('scrolling');
                        }
                    }
                    
                    if (!foundNew) {
                        noNewVideosCount++;
                        console.log(`⚠️ No new videos found (${noNewVideosCount}/5)`);
                        
                        // Scroll down to load more
                        await this.stealth.humanScroll(this.page, 'down');
                        await this.stealth.humanDelay('scrolling');
                    }
                } else {
                    // Feed mode - extract current video
                    const video = await this.extractCurrentVideo();
                    
                    if (video && !processed.has(video.id)) {
                        processed.add(video.id);
                        noNewVideosCount = 0;
                        yield video;
                    } else {
                        noNewVideosCount++;
                    }
                    
                    // Scroll to next video
                    await this.page.keyboard.press('ArrowDown');
                    await this.stealth.humanDelay('scrolling');
                }
            }
        } finally {
            console.log(`📊 Scroll session complete: ${processed.size} videos found`);
        }
    }

    async extractSearchVideos() {
        return await this.page.evaluate(() => {
            const results = [];
            const videoContainers = document.querySelectorAll('[data-e2e="search_top-item"], [data-e2e="search-item"]');
            
            videoContainers.forEach(container => {
                // Find the video link within the container
                const link = container.querySelector('a[href*="/video/"], a[href*="/@"]');
                if (!link || !link.href.includes('/video/')) return;
                
                const videoUrl = link.href;
                const videoId = videoUrl.match(/video\/(\d+)/)?.[1];
                if (!videoId) return;
                
                const author = videoUrl.match(/@([^/]+)/)?.[1] || 'unknown';
                
                // Try multiple selectors for description
                const descSelectors = [
                    '[data-e2e="search-card-desc"]',
                    '[class*="video-card-caption"]',
                    '[class*="caption"]',
                    'h3',
                    '[title]'
                ];
                
                let description = '';
                for (const selector of descSelectors) {
                    const desc = container.querySelector(selector);
                    if (desc) {
                        description = desc.textContent || desc.title || '';
                        break;
                    }
                }
                
                results.push({
                    id: videoId,
                    url: videoUrl,
                    author: author,
                    description: description.trim(),
                    platform: 'tiktok'
                });
            });
            
            return results;
        });
    }

    async extractCurrentVideo() {
        try {
            // Wait a bit for video to load
            await this.stealth.humanDelay('default');
            
            return await this.page.evaluate(() => {
                // Get current URL
                const currentUrl = window.location.href;
                
                // Extract video ID from URL
                const videoId = currentUrl.match(/video\/(\d+)/)?.[1];
                if (!videoId) {
                    // Generate ID for feed videos
                    const author = document.querySelector('[data-e2e="video-author"], a[href*="/@"]')?.textContent || 'unknown';
                    return {
                        id: `tiktok_${author.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        url: currentUrl,
                        author: author,
                        description: document.querySelector('[data-e2e="video-desc"], h1')?.textContent || '',
                        platform: 'tiktok'
                    };
                }
                
                // Extract author
                const authorElement = document.querySelector('[data-e2e="video-author"], a[href*="/@"]');
                const author = authorElement?.textContent || authorElement?.href?.split('/@')[1]?.split('?')[0] || 'unknown';
                
                // Extract description
                const description = document.querySelector('[data-e2e="video-desc"], h1')?.textContent || '';
                
                return {
                    id: videoId,
                    url: currentUrl,
                    author: author,
                    description: description.trim(),
                    platform: 'tiktok'
                };
            });
        } catch (error) {
            console.error('Error extracting video:', error);
            return null;
        }
    }

    async navigateToVideo(video) {
        try {
            await this.page.goto(video.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            await this.stealth.humanDelay('reading');
        } catch (error) {
            console.error('Error navigating to video:', error);
        }
    }

    async getVideoDetails() {
        try {
            await this.stealth.humanDelay('reading');
            
            return await this.page.evaluate(() => {
                const selectors = {
                    likes: ['[data-e2e="like-count"]', '[data-e2e="video-like-count"]', 'strong[data-e2e="like-count"]'],
                    comments: ['[data-e2e="comment-count"]', '[data-e2e="video-comment-count"]'],
                    shares: ['[data-e2e="share-count"]', '[data-e2e="video-share-count"]']
                };
                
                const getCount = (selectorArray) => {
                    for (const selector of selectorArray) {
                        const element = document.querySelector(selector);
                        if (element) return element.textContent.trim() || '0';
                    }
                    return '0';
                };
                
                return {
                    counts: {
                        likes: getCount(selectors.likes),
                        comments: getCount(selectors.comments),
                        shares: getCount(selectors.shares),
                        favorites: '0'
                    }
                };
            });
        } catch (error) {
            return { counts: { likes: '0', comments: '0', shares: '0', favorites: '0' } };
        }
    }

    async getComments(limit = 50) {
        try {
            console.log('💬 Getting comments...');
            
            // Check if comments panel is open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                // Find and click comment button
                const commentButton = await this.page.$('[data-e2e="comment-icon"], [data-e2e="video-comment-icon"]');
                
                if (commentButton) {
                    await this.stealth.humanMouseMove(this.page, commentButton);
                    await this.stealth.humanDelay('beforeClick');
                    await commentButton.click();
                    await this.stealth.humanDelay('afterClick');
                    
                    // Wait for panel
                    await this.page.waitForSelector('[data-e2e="comment-list"], [class*="CommentList"]', {
                        timeout: 10000
                    }).catch(() => null);
                }
            }
            
            await this.stealth.simulateReading('Reading comments...');
            
            // Extract comments
            const comments = await this.page.evaluate((limit) => {
                const results = [];
                const commentElements = document.querySelectorAll('[data-e2e="comment-item"], [class*="CommentItem"]');
                
                commentElements.forEach(container => {
                    const username = container.querySelector('[data-e2e="comment-username"], a[href*="/@"]')?.textContent?.trim() || '';
                    const text = container.querySelector('[data-e2e="comment-text"], [class*="comment-text"], span[class*="text"]')?.textContent?.trim() || '';
                    const likes = container.querySelector('[data-e2e="comment-like-count"], [class*="like"] span')?.textContent?.trim() || '0';
                    
                    if (username && text) {
                        results.push({ username, text, likes });
                    }
                });
                
                return results.slice(0, limit);
            }, limit);
            
            console.log(`📝 Found ${comments.length} comments`);
            return comments;
            
        } catch (error) {
            console.error('Error getting comments:', error);
            return [];
        }
    }

    async postComment(text) {
        try {
            console.log('✍️ Posting comment...');
            
            // Check for captcha
            if (await this.checkForCaptcha()) {
                await this.waitForCaptchaSolved();
            }
            
            // Ensure comments are open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                await this.stealth.humanDelay('beforeComment');
                await this.getComments(1); // Open comments
            }
            
            // Find comment input
            const inputSelectors = [
                '[data-e2e="comment-input"]',
                'div[contenteditable="true"][data-e2e*="comment"]',
                'div[contenteditable="true"][class*="comment-input"]',
                'div[contenteditable="true"][class*="CommentInput"]'
            ];
            
            let inputElement = null;
            for (const selector of inputSelectors) {
                inputElement = await this.page.$(selector);
                if (inputElement) break;
            }
            
            if (!inputElement) {
                console.error('❌ Comment input not found');
                return false;
            }
            
            // Type comment
            await this.stealth.humanMouseMove(this.page, inputElement);
            await this.stealth.humanDelay('beforeClick');
            await inputElement.click();
            await this.stealth.humanDelay('default');
            
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('A');
            await this.page.keyboard.up('Control');
            await this.stealth.wait(100);
            
            await this.stealth.humanType(this.page, text);
            await this.stealth.humanDelay('afterClick');
            
            // Submit
            const postButton = await this.page.$('[data-e2e="comment-post"], button[type="submit"]:not([disabled])');
            
            if (postButton) {
                await this.stealth.humanMouseMove(this.page, postButton);
                await this.stealth.humanDelay('beforeClick');
                await postButton.click();
            } else {
                await this.page.keyboard.press('Enter');
            }
            
            await this.stealth.humanDelay('afterClick');
            
            // Close comments
            await this.page.keyboard.press('Escape');
            await this.stealth.humanDelay('default');
            
            console.log('✅ Comment posted');
            return true;
            
        } catch (error) {
            console.error('❌ Error posting comment:', error);
            return false;
        }
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
                    this.captchaDetected = true;
                    return true;
                }
            }
        }
        
        this.captchaDetected = false;
        return false;
    }

    async waitForCaptchaSolved() {
        console.log('🤖 Captcha detected! Waiting for manual solve...');
        
        while (await this.checkForCaptcha()) {
            await this.stealth.wait(2000);
        }
        
        console.log('✅ Captcha solved! Resuming...');
        await this.stealth.wait(2000);
    }

    getCaptchaStatus() {
        return this.captchaDetected;
    }

    async stopScrolling() {
        console.log('⏹️ Stopping scroll session');
    }

    async disconnect() {
        if (this.browser) {
            await this.browser.disconnect();
            console.log('🔌 Disconnected from Chrome');
            this.isConnected = false;
        }
    }

    wait(ms) {
        return this.stealth.wait(ms);
    }
}

module.exports = BrowserManager;