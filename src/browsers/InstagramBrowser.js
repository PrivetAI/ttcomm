const BaseBrowser = require('./BaseBrowser');

class InstagramBrowser extends BaseBrowser {
    async navigate() {
        await this.page.goto('https://www.instagram.com/reels/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        await this.wait(3000);
    }

    async checkLogin() {
        const loginLink = await this.page.$('a[href="/accounts/login/"]');
        return !loginLink;
    }

    async extractVideos() {
        return await this.page.evaluate(() => {
            const results = [];
            const articles = document.querySelectorAll('article');
            
            articles.forEach(article => {
                const video = article.querySelector('video');
                if (!video) return;
                
                const rect = video.getBoundingClientRect();
                const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight * 1.5;
                
                if (isInViewport && video.offsetHeight > 200) {
                    // Get author
                    const authorLink = article.querySelector('a[href^="/"]');
                    const author = authorLink?.href.split('/')[1] || 'unknown';
                    
                    // Get description
                    const imgAlt = article.querySelector('img[alt]')?.alt || '';
                    const caption = article.querySelector('[data-testid="post-comment-root"]')?.textContent || '';
                    const description = caption || imgAlt;
                    
                    // Generate unique ID
                    const videoId = `ig_${author}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    
                    results.push({
                        id: videoId,
                        url: window.location.href,
                        author: author,
                        description: description.trim(),
                        platform: 'instagram'
                    });
                }
            });
            
            return results;
        });
    }

    async scrollToNext() {
        await this.page.keyboard.press('ArrowDown');
    }

    async getVideoDetails() {
        try {
            return await this.page.evaluate(() => {
                const article = document.querySelector('article');
                if (!article) return null;
                
                // Get likes
                const likeButton = article.querySelector('[aria-label*="like"]');
                const likesText = likeButton?.parentElement?.parentElement?.querySelector('span')?.textContent || '0';
                
                // Get comments count
                const commentButton = article.querySelector('[aria-label*="Comment"]');
                const commentsText = commentButton?.parentElement?.querySelector('span')?.textContent || '0';
                
                return {
                    counts: {
                        likes: likesText,
                        comments: commentsText,
                        shares: '0',
                        favorites: '0'
                    }
                };
            }) || { counts: { likes: '0', comments: '0', shares: '0', favorites: '0' } };
        } catch (error) {
            return { counts: { likes: '0', comments: '0', shares: '0', favorites: '0' } };
        }
    }

    async getComments(limit = 50) {
        try {
            console.log('💬 Getting Instagram comments...');
            
            // Click on comments if not already open
            const commentsOpened = await this.page.evaluate(() => {
                const commentButton = document.querySelector('[aria-label*="Comment"]');
                if (commentButton) {
                    commentButton.click();
                    return true;
                }
                return false;
            });
            
            if (commentsOpened) {
                await this.wait(2000);
            }
            
            // Extract comments
            const comments = await this.page.evaluate((limit) => {
                const results = [];
                const commentElements = document.querySelectorAll('[role="button"] > div > div > span');
                
                commentElements.forEach(element => {
                    const container = element.closest('[role="button"]');
                    if (!container) return;
                    
                    const usernameLink = container.querySelector('a[href^="/"]');
                    const username = usernameLink?.textContent?.trim() || '';
                    const text = element.textContent?.trim() || '';
                    
                    // Skip if it's the main caption
                    if (container.querySelector('time')) {
                        return;
                    }
                    
                    if (username && text) {
                        results.push({ username, text, likes: '0' });
                    }
                });
                
                return results.slice(0, limit);
            }, limit);
            
            console.log(`📝 Found ${comments.length} comments`);
            return comments;
            
        } catch (error) {
            console.error('Error getting Instagram comments:', error);
            return [];
        }
    }

    async postComment(text) {
        try {
            console.log('✍️ Posting Instagram comment...');
            
            // Check for captcha before posting
            if (await this.checkForCaptcha()) {
                await this.waitForCaptchaSolved();
            }
            
            // Open comments if needed
            await this.page.evaluate(() => {
                const commentButton = document.querySelector('[aria-label*="Comment"]');
                if (commentButton) commentButton.click();
            });
            
            await this.wait(2000);
            
            // Find and click comment input
            const inputFound = await this.page.evaluate(() => {
                const textarea = document.querySelector('textarea[aria-label*="comment"]');
                if (textarea) {
                    textarea.focus();
                    textarea.click();
                    return true;
                }
                return false;
            });
            
            if (!inputFound) return false;
            
            // Type comment
            await this.wait(1000);
            await this.page.keyboard.type(text, { delay: 50 });
            await this.wait(1000);
            
            // Submit comment
            const submitted = await this.page.evaluate(() => {
                const postButton = document.querySelector('button[type="submit"]');
                if (postButton && !postButton.disabled) {
                    postButton.click();
                    return true;
                }
                return false;
            });
            
            if (!submitted) {
                await this.page.keyboard.press('Enter');
            }
            
            await this.wait(2000);
            console.log('✅ Comment posted successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Error posting comment:', error);
            return false;
        }
    }
}

module.exports = InstagramBrowser;