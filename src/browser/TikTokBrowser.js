// TikTokBrowser.js - Simplified Docker-compatible version

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class TikTokBrowser {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.options = {
            headless: options.headless !== false ? 'new' : false, // Use new headless mode
            ...options
        };
        this.userDataDir = path.join('/app/browser_data', 'tiktok-session');
    }

    async initialize() {
        try {
            console.log('🚀 Starting browser...');
            
            console.log('🔧 Launching new browser instance...');
            if (!fs.existsSync(this.userDataDir)) {
                fs.mkdirSync(this.userDataDir, { recursive: true });
            }
            const browserOptions = {
                headless: this.options.headless,
                args: [
                    '--headless=new',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--window-size=1920,1080',
                    `--user-data-dir=${this.userDataDir}`
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            };
            this.browser = await puppeteer.launch(browserOptions);
            this.page = await this.browser.newPage();
            console.log('✅ New browser instance launched');
            
            // Basic page setup
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Simple stealth setup
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
            });
            
            console.log('✅ Browser initialized successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Browser initialization error:', error.message);
            throw error;
        }
    }

    async checkLoginStatus() {
        try {
            console.log('🔍 Checking login status...');
            
            await this.page.goto('https://www.tiktok.com/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            await delay(3000);
            
            // Simple login check
            const loginButton = await this.page.$('button[data-e2e="top-login-button"]');
            const isLoggedIn = !loginButton;
            
            console.log(isLoggedIn ? '✅ User is logged in' : '❌ Login required');
            return isLoggedIn;
            
        } catch (error) {
            console.error('❌ Login status check error:', error.message);
            return false;
        }
    }

    async manualLogin() {
        if (this.options.headless) {
            const loginInstructions = `
            ##################################################################################################
            MANUAL LOGIN REQUIRED - Run in non-headless mode
            ##################################################################################################
            
            The bot needs to be logged in, but it's running in headless mode.
            
            1. Stop the bot (Ctrl+C).
            2. Open 'docker-compose.yml'.
            3. Find the 'app' service and under 'environment', set 'HEADLESS_MODE' to 'false'.
               If it doesn't exist, add it under 'environment':
                 - HEADLESS_MODE=false
            4. You may also need to configure your system to show the browser GUI from the Docker container.
               This usually involves setting the DISPLAY environment variable and using X11 forwarding.
               Example for a Linux host in docker-compose.yml:
                 environment:
                   - DISPLAY=${DISPLAY}
                   - HEADLESS_MODE=false
                 volumes:
                   - .:/app
                   - /tmp/.X11-unix:/tmp/.X11-unix
            5. Run 'docker-compose up --build'. A browser window should appear.
            6. Log into TikTok.
            7. Once logged in, stop the bot, set 'HEADLESS_MODE' back to 'true', and restart.
            
            The login session will be saved in the '${this.userDataDir}' directory inside the container.
            
            ##################################################################################################
            `;
            throw new Error(loginInstructions);
        } else {
            console.log('👤 Manual login required. Please log in to TikTok in the browser window.');
            console.log('The bot will attempt to continue after you log in (the login button disappears). Waiting up to 5 minutes.');
            await this.page.goto('https://www.tiktok.com/login/phone-or-email/email', {
                waitUntil: 'networkidle2'
            });
            try {
                await this.page.waitForSelector('button[data-e2e="top-login-button"]', { hidden: true, timeout: 300000 }); // Wait 5 mins for login
                console.log('✅ Login successful!');
            } catch (e) {
                console.warn('⚠️ Timed out waiting for login. Continuing anyway...');
            }
        }
    }

    async *scrollFeed(feedType = 'general', hashtags = []) {
        try {
            let url = 'https://www.tiktok.com/foryou';
            
            if (feedType === 'hashtag' && hashtags.length > 0) {
                url = `https://www.tiktok.com/tag/${hashtags[0]}`;
            }
            
            console.log('🔄 Navigating to:', url);
            
            await this.page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            let processedVideos = new Set();
            let scrollAttempts = 0;
            const maxScrollAttempts = 50;
            
            while (scrollAttempts < maxScrollAttempts) {
                try {
                    await delay(2000);
                    
                    const videos = await this.page.evaluate(() => {
                        const videoElements = document.querySelectorAll('[data-e2e="recommend-list-item"]');
                        const results = [];
                        
                        videoElements.forEach(element => {
                            try {
                                const link = element.querySelector('a[href*="/video/"]');
                                const author = element.querySelector('[data-e2e="video-author-uniqueid"]');
                                const description = element.querySelector('[data-e2e="video-desc"]');
                                
                                if (link && author) {
                                    const url = link.href;
                                    const tiktokId = url.split('/').pop();
                                    
                                    if (tiktokId) {
                                        results.push({
                                            tiktok_id: tiktokId,
                                            url: url,
                                            author: author.textContent.trim(),
                                            description: description ? description.textContent.trim() : ''
                                        });
                                    }
                                }
                            } catch (e) {
                                // Skip invalid elements
                            }
                        });
                        
                        return results;
                    });
                    
                    let newVideosCount = 0;
                    for (const video of videos) {
                        if (!processedVideos.has(video.tiktok_id)) {
                            processedVideos.add(video.tiktok_id);
                            newVideosCount++;
                            yield video;
                        }
                    }
                    
                    console.log(`📹 Found new videos: ${newVideosCount}, total: ${processedVideos.size}`);
                    
                    await this.page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    
                    scrollAttempts++;
                    await delay(3000);
                    
                } catch (error) {
                    console.error('❌ Scroll error:', error.message);
                    scrollAttempts++;
                    await delay(5000);
                }
            }
            
            console.log('✅ Scrolling completed');
            
        } catch (error) {
            console.error('❌ Feed scroll error:', error.message);
            throw error;
        }
    }

    async close() {
        try {
            if (this.page) {
                await this.page.close();
            }
            if (this.browser) {
                await this.browser.close();
                console.log('🔚 Browser closed');
            }
        } catch (error) {
            console.error('❌ Browser close error:', error.message);
        } finally {
            // User data directory is persistent now
        }
    }
}

module.exports = TikTokBrowser;
