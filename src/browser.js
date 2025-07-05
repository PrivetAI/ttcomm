const puppeteer = require('puppeteer-core');

class TikTokBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log('🔌 Connecting to Chrome...');
            
            // Fix connection - use only one endpoint
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
            
            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();
            
            // Set user agent to avoid detection
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            console.log('✅ Connected to Chrome');
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
        
        // Navigate to TikTok only once
        console.log('🌐 Navigating to TikTok...');
        await this.page.goto('https://www.tiktok.com/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        await this.wait(3000);
        
        // Check if login is required
        const loginButton = await this.page.$('button[data-e2e="top-login-button"], [data-e2e="login-button"]');
        const isLoggedIn = !loginButton;
        
        console.log(isLoggedIn ? '✅ Already logged in' : '⚠️ Not logged in');
        return isLoggedIn;
    }

    async *scrollFeed(feedType = 'foryou', hashtags = []) {
        // Navigate to specific feed if needed
        if (feedType === 'hashtag' && hashtags.length > 0) {
            const url = `https://www.tiktok.com/tag/${hashtags[0]}`;
            console.log(`🏷️ Navigating to hashtag: ${url}`);
            await this.page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            await this.wait(3000);
        }
        
        await this.wait(2000);
        
        let processed = new Set();
        let attempts = 0;
        let noNewVideosCount = 0;
        
        while (attempts < 100 && noNewVideosCount < 5) {
            attempts++;
            
            // Get current video using multiple strategies
            const videos = await this.page.evaluate(() => {
                const results = [];
                
                // Strategy 1: Look for video containers with data attributes
                const videoContainers = document.querySelectorAll('[data-e2e="recommend-list-item"], [data-e2e="video-item"]');
                
                if (videoContainers.length === 0) {
                    // Strategy 2: Look for video elements and traverse up
                    const videoElements = document.querySelectorAll('video');
                    
                    videoElements.forEach(video => {
                        const rect = video.getBoundingClientRect();
                        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight * 1.5;
                        
                        if (isInViewport && video.offsetHeight > 200) {
                            let container = video;
                            
                            // Traverse up to find the main container
                            for (let i = 0; i < 15; i++) {
                                container = container.parentElement;
                                if (!container) break;
                                
                                // Look for author and description
                                const authorElement = container.querySelector('[data-e2e="video-author"], a[href*="/@"]');
                                const descElement = container.querySelector('[data-e2e="video-desc"], h1');
                                
                                if (authorElement) {
                                    const author = authorElement.textContent || authorElement.href?.split('/@')[1]?.split('?')[0] || 'unknown';
                                    const description = descElement?.textContent || '';
                                    
                                    // Try to extract video ID from URL or generate one
                                    const videoUrl = window.location.href;
                                    let videoId = videoUrl.match(/video\/(\d+)/)?.[1];
                                    
                                    if (!videoId) {
                                        // Generate ID from timestamp and author
                                        videoId = `${author.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    }
                                    
                                    results.push({
                                        id: videoId,
                                        url: videoUrl.includes('/video/') ? videoUrl : `https://www.tiktok.com/@${author}/video/${videoId}`,
                                        author: author,
                                        description: description.trim()
                                    });
                                    break;
                                }
                            }
                        }
                    });
                }
                
                return results;
            });
            
            console.log(`Attempt ${attempts}: Found ${videos.length} videos`);
            
            // Process new videos
            let foundNew = false;
            for (const video of videos) {
                if (!processed.has(video.id)) {
                    processed.add(video.id);
                    foundNew = true;
                    noNewVideosCount = 0;
                    yield video;
                    break; // Process one video at a time
                }
            }
            
            if (!foundNew) {
                noNewVideosCount++;
                console.log(`⚠️ No new videos found (${noNewVideosCount}/5)`);
            }
            
            // Click second button to switch to next video
            console.log('⬇️ Clicking next video button...');
            const clicked = await this.page.evaluate(() => {
                const buttons = document.querySelectorAll('button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-1rxmjnh');
                if (buttons.length >= 2) {
                    buttons[1].click();
                    return true;
                }
                return false;
            });
            
            if (!clicked) {
                console.log('⚠️ Next video button not found');
            }
            
            // Wait for video to load
            await this.wait(foundNew ? 2000 : 1500);
            
        }
    }

    async getVideoDetails(videoUrl) {
        try {
            const details = await this.page.evaluate(() => {
                // Multiple selectors for engagement metrics
                const selectors = {
                    likes: [
                        '[data-e2e="like-count"]',
                        '[data-e2e="video-like-count"]',
                        'strong[data-e2e="like-count"]',
                        '.tiktok-1xwdmkr-StrongText'
                    ],
                    comments: [
                        '[data-e2e="comment-count"]',
                        '[data-e2e="video-comment-count"]',
                        'strong[data-e2e="comment-count"]'
                    ],
                    shares: [
                        '[data-e2e="share-count"]',
                        '[data-e2e="video-share-count"]',
                        'strong[data-e2e="share-count"]'
                    ]
                };
                
                const getCount = (selectorArray) => {
                    for (const selector of selectorArray) {
                        const element = document.querySelector(selector);
                        if (element) {
                            return element.textContent.trim() || '0';
                        }
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
            
            return details;
        } catch (error) {
            console.error('Error getting video details:', error);
            return {
                counts: {
                    likes: '0',
                    comments: '0',
                    shares: '0',
                    favorites: '0'
                }
            };
        }
    }

    async getComments(videoUrl, limit = 50) {
        try {
            console.log('💬 Getting comments...');
            
            // Check if comments panel is already open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                console.log('📂 Opening comments panel...');
                
                // Try multiple selectors for comment button
                const commentOpened = await this.page.evaluate(() => {
                    const selectors = [
                        '[data-e2e="comment-icon"]',
                        '[data-e2e="video-comment-icon"]',
                        'button[aria-label*="comment"]',
                        'button[aria-label*="Comment"]'
                    ];
                    
                    for (const selector of selectors) {
                        const btn = document.querySelector(selector);
                        if (btn) {
                            const clickTarget = btn.closest('button') || btn.parentElement;
                            if (clickTarget) {
                                clickTarget.click();
                                return true;
                            }
                        }
                    }
                    return false;
                });
                
                if (!commentOpened) {
                    console.log('⚠️ Could not open comments panel');
                    return [];
                }
                
                // Wait for comments to load
                await this.wait(3000);
            }
            
            // Extract comments using multiple strategies
            const comments = await this.page.evaluate((limit) => {
                const results = [];
                
                // Strategy 1: Look for comment containers with data attributes
                let commentElements = document.querySelectorAll('[data-e2e="comment-item"], [data-e2e="comment-content"]');
                
                if (commentElements.length === 0) {
                    // Strategy 2: Look for comment-like structures
                    commentElements = document.querySelectorAll('[class*="Comment"], [class*="comment"]');
                }
                
                commentElements.forEach(container => {
                    // Extract username
                    const usernameSelectors = [
                        '[data-e2e="comment-username"]',
                        'a[href*="/@"]',
                        '[class*="Username"]',
                        '[class*="username"]'
                    ];
                    
                    let username = '';
                    for (const selector of usernameSelectors) {
                        const element = container.querySelector(selector);
                        if (element) {
                            username = element.textContent.trim() || element.href?.split('/@')[1]?.split('?')[0] || '';
                            if (username) break;
                        }
                    }
                    
                    // Extract comment text
                    const textSelectors = [
                        '[data-e2e="comment-text"]',
                        'p',
                        'span:not([class*="username"]):not([class*="Username"])',
                        '[class*="CommentText"]'
                    ];
                    
                    let text = '';
                    for (const selector of textSelectors) {
                        const element = container.querySelector(selector);
                        if (element && element.textContent.trim().length > 0) {
                            text = element.textContent.trim();
                            break;
                        }
                    }
                    
                    // Extract likes
                    const likeSelectors = [
                        '[data-e2e="comment-like-count"]',
                        '[class*="like"] span',
                        '[class*="Like"] span'
                    ];
                    
                    let likes = '0';
                    for (const selector of likeSelectors) {
                        const element = container.querySelector(selector);
                        if (element) {
                            likes = element.textContent.trim() || '0';
                            break;
                        }
                    }
                    
                    if (username && text && text.length > 0) {
                        results.push({
                            username: username,
                            text: text,
                            likes: likes
                        });
                    }
                });
                
                return results.slice(0, limit);
            }, limit);
            
            console.log(`📝 Found ${comments.length} comments`);
            
            // // Close comments panel if we opened it
            // if (!await this.page.evaluate(() => document.querySelector('[data-e2e="comment-list"]'))) {
            //     await this.page.keyboard.press('Escape');
            //     await this.wait(1000);
            // }
            
            return comments;
            
        } catch (error) {
            console.error('Error getting comments:', error);
            return [];
        }
    }

    async postComment(videoUrl, text) {
        try {
            console.log('✍️ Posting comment...');
            
            // Open comments if not already open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                const commentOpened = await this.page.evaluate(() => {
                    const selectors = [
                        '[data-e2e="comment-icon"]',
                        '[data-e2e="video-comment-icon"]',
                        'button[aria-label*="comment"]'
                    ];
                    
                    for (const selector of selectors) {
                        const btn = document.querySelector(selector);
                        if (btn) {
                            const clickTarget = btn.closest('button') || btn.parentElement;
                            if (clickTarget) {
                                clickTarget.click();
                                return true;
                            }
                        }
                    }
                    return false;
                });
                
                if (!commentOpened) {
                    console.log('⚠️ Could not open comments for posting');
                    return false;
                }
                
                await this.wait(2000);
            }
            
            // Find and focus comment input
            const inputFound = await this.page.evaluate(() => {
                const selectors = [
                    '[data-e2e="comment-input"]',
                    'textarea[placeholder*="comment"]',
                    'textarea[placeholder*="Comment"]',
                    '[contenteditable="true"]'
                ];
                
                for (const selector of selectors) {
                    const input = document.querySelector(selector);
                    if (input && input.offsetHeight > 0) {
                        input.focus();
                        input.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (!inputFound) {
                console.log('⚠️ Comment input not found');
                return false;
            }
            
            await this.wait(1000);
            
            // Clear and type comment
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('A');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.type(text, { delay: 50 });
            
            await this.wait(1000);
            
            // Submit comment
            const submitted = await this.page.evaluate(() => {
                const selectors = [
                    '[data-e2e="comment-post"]',
                    'button[type="submit"]',
                    'button:contains("Post")',
                    'button:contains("发布")'
                ];
                
                for (const selector of selectors) {
                    const btn = document.querySelector(selector);
                    if (btn && !btn.disabled) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (!submitted) {
                // Try Enter key as fallback
                await this.page.keyboard.press('Enter');
            }
            
            await this.wait(2000);
            
            // Close comments panel
            await this.page.keyboard.press('Escape');
            await this.wait(1000);
            
            console.log('✅ Comment posted successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Error posting comment:', error);
            return false;
        }
    }

    async disconnect() {
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

module.exports = TikTokBrowser;