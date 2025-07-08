const BaseBrowser = require('./BaseBrowser');

class TikTokBrowser extends BaseBrowser {
    async navigate(feedType = 'foryou', hashtags = []) {
        if (feedType === 'hashtag' && hashtags.length > 0) {
            const url = `https://www.tiktok.com/tag/${hashtags[0]}`;
            console.log(`🏷️ Navigating to hashtag: ${url}`);
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        } else {
            await this.page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        }
        await this.wait(3000);
    }

    async checkLogin() {
        const loginButton = await this.page.$('button[data-e2e="top-login-button"], [data-e2e="login-button"]');
        return !loginButton;
    }

    async extractVideos() {
        return await this.page.evaluate(() => {
            const results = [];
            const videoElements = document.querySelectorAll('video');
            
            videoElements.forEach(video => {
                const rect = video.getBoundingClientRect();
                const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight * 1.5;
                
                if (isInViewport && video.offsetHeight > 200) {
                    let container = video;
                    
                    for (let i = 0; i < 15; i++) {
                        container = container.parentElement;
                        if (!container) break;
                        
                        const authorElement = container.querySelector('[data-e2e="video-author"], a[href*="/@"]');
                        const descElement = container.querySelector('[data-e2e="video-desc"], h1');
                        
                        if (authorElement) {
                            const author = authorElement.textContent || authorElement.href?.split('/@')[1]?.split('?')[0] || 'unknown';
                            const description = descElement?.textContent || '';
                            const videoUrl = window.location.href;
                            let videoId = videoUrl.match(/video\/(\d+)/)?.[1] || 
                                `tiktok_${author.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            
                            results.push({
                                id: videoId,
                                url: videoUrl.includes('/video/') ? videoUrl : `https://www.tiktok.com/@${author}/video/${videoId}`,
                                author: author,
                                description: description.trim(),
                                platform: 'tiktok'
                            });
                            break;
                        }
                    }
                }
            });
            
            return results;
        });
    }

    async scrollToNext() {
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
    }

    async getVideoDetails() {
        try {
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
            console.log('💬 Getting TikTok comments...');
            
            // Check if comments panel is open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                // Open comments
                const commentOpened = await this.page.evaluate(() => {
                    const selectors = ['[data-e2e="comment-icon"]', '[data-e2e="video-comment-icon"]', 'button[aria-label*="comment"]'];
                    
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
                
                await this.wait(3000);
            }
            
            // Extract comments
            const comments = await this.page.evaluate((limit) => {
                const results = [];
                const commentElements = document.querySelectorAll('[data-e2e="comment-item"], [class*="Comment"]');
                
                commentElements.forEach(container => {
                    const username = container.querySelector('[data-e2e="comment-username"], a[href*="/@"]')?.textContent?.trim() || '';
                    const text = container.querySelector('[data-e2e="comment-text"], p')?.textContent?.trim() || '';
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
            console.error('Error getting TikTok comments:', error);
            return [];
        }
    }

    async postComment(text) {
        try {
            console.log('✍️ Posting TikTok comment...');
            
            // Check for captcha before posting
            if (await this.checkForCaptcha()) {
                await this.waitForCaptchaSolved();
            }
            
            // Ensure comments are open
            const isCommentsOpen = await this.page.evaluate(() => {
                return document.querySelector('[data-e2e="comment-list"], [class*="CommentList"]') !== null;
            });
            
            if (!isCommentsOpen) {
                await this.getComments(1); // This will open comments
            }
            
            // Find and focus input
            const inputFound = await this.page.evaluate(() => {
                const selectors = ['[data-e2e="comment-input"]', 'textarea[placeholder*="comment"]', '[contenteditable="true"]'];
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
            
            if (!inputFound) return false;
            
            // Type comment
            await this.wait(1000);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('A');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.type(text, { delay: 50 });
            await this.wait(1000);
            
            // Submit
            const submitted = await this.page.evaluate(() => {
                const selectors = ['[data-e2e="comment-post"]', 'button[type="submit"]'];
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
                await this.page.keyboard.press('Enter');
            }
            
            await this.wait(2000);
            
            // Close comments
            await this.page.keyboard.press('Escape');
            await this.wait(1000);
            
            console.log('✅ Comment posted successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Error posting comment:', error);
            return false;
        }
    }
}

module.exports = TikTokBrowser;