const { spawn } = require('child_process');
const readline = require('readline');
const AutomationStrategy = require('../AutomationStrategy');

/**
 * MCP Puppeteer automation strategy
 * Uses Model Context Protocol to communicate with Puppeteer MCP server
 */
class MCPPuppeteerStrategy extends AutomationStrategy {
    constructor(config = {}) {
        super(config);
        this.mcpProcess = null;
        this.rl = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
    }

    async initialize() {
        try {
            console.log('🔌 Starting MCP Puppeteer server...');
            
            // Start MCP server process
            this.mcpProcess = spawn('npx', [
                '-y',
                '@modelcontextprotocol/server-puppeteer'
            ], {
                env: {
                    ...process.env,
                    PUPPETEER_LAUNCH_OPTIONS: JSON.stringify({
                        headless: false,
                        defaultViewport: { width: 1366, height: 768 },
                        args: [
                            // '--no-sanёdbox',
                            // '--disable-setuid-sandbox',
                            '--disable-blink-features=AutomationControlled'
                        ]
                    })
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Set up readline interface for JSON-RPC communication
            this.rl = readline.createInterface({
                input: this.mcpProcess.stdout,
                output: this.mcpProcess.stdin
            });

            // Handle MCP server responses
            this.rl.on('line', (line) => {
                try {
                    const message = JSON.parse(line);
                    if (message.id && this.pendingRequests.has(message.id)) {
                        const { resolve, reject } = this.pendingRequests.get(message.id);
                        this.pendingRequests.delete(message.id);
                        
                        if (message.error) {
                            reject(new Error(message.error.message));
                        } else {
                            resolve(message.result);
                        }
                    }
                } catch (error) {
                    console.error('MCP parse error:', error);
                }
            });

            // Handle errors
            this.mcpProcess.stderr.on('data', (data) => {
                console.error(`MCP Error: ${data}`);
            });

            // Wait a bit for the server to start
            await this.wait(2000);

            // Initialize connection with proper clientInfo
            await this.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: 'TikTok-Bot-MCP-Client',
                    version: '1.0.0'
                }
            });

            // Send initialized notification
            await this.sendNotification('initialized', {});
            
            this.isConnected = true;
            console.log('✅ MCP Puppeteer ready');
            return true;
        } catch (error) {
            console.error('❌ MCP initialization failed:', error.message);
            throw error;
        }
    }

    async sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };
            
            this.pendingRequests.set(id, { resolve, reject });
            
            // Send request to MCP server
            this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('MCP request timeout'));
                }
            }, 30000);
        });
    }

    async sendNotification(method, params = {}) {
        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };
        
        this.mcpProcess.stdin.write(JSON.stringify(notification) + '\n');
    }

    async callTool(toolName, parameters) {
        return await this.sendRequest('tools/call', {
            name: toolName,
            arguments: parameters
        });
    }

    async navigate(url) {
        return await this.callTool('puppeteer_navigate', {
            url,
            waitUntil: 'networkidle2'
        });
    }

    async searchTikTok(query) {
        const url = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
        console.log(`🔍 Searching for: "${query}"`);
        
        await this.navigate(url);
        
        // Wait for page to load
        await this.wait(3000);
        
        // Click on Videos tab
        await this.callTool('puppeteer_click', {
            selector: '[data-e2e="search-video-tab"], [href*="/search/video"]'
        });
        
        await this.wait(2000);
    }

    async checkLogin() {
        const result = await this.callTool('puppeteer_evaluate', {
            script: `() => {
                const loginButton = document.querySelector('button[data-e2e="top-login-button"], [data-e2e="login-button"]');
                return !loginButton;
            }`
        });
        
        return result.value;
    }

    async extractVideos() {
        const result = await this.callTool('puppeteer_evaluate', {
            script: `() => {
                const results = [];
                const isSearchPage = window.location.pathname.includes('/search');
                
                if (isSearchPage) {
                    // Search page - look for search result items
                    const videoContainers = document.querySelectorAll('[data-e2e="search_top-item"], [data-e2e="search-item"]');
                    
                    videoContainers.forEach(container => {
                        const link = container.querySelector('a[href*="/video/"], a[href*="/@"]');
                        if (!link || !link.href.includes('/video/')) return;
                        
                        const videoUrl = link.href;
                        const videoId = videoUrl.match(/video\\/(\\d+)/)?.[1];
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
                }
                
                return results;
            }`
        });
        
        return result.value || [];
    }

    async scrollToNext() {
        const result = await this.callTool('puppeteer_evaluate', {
            script: `() => window.location.pathname.includes('/search')`
        });
        
        if (result.value) {
            // Search page - scroll down
            await this.callTool('puppeteer_scroll', {
                direction: 'down',
                amount: 300
            });
        } else {
            // Feed page - press arrow key
            await this.callTool('puppeteer_keyboard', {
                key: 'ArrowDown'
            });
        }
        
        await this.wait(2000);
    }

    async getVideoDetails() {
        const result = await this.callTool('puppeteer_evaluate', {
            script: `() => {
                const selectors = {
                    likes: ['[data-e2e="like-count"]', '[data-e2e="video-like-count"]'],
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
            }`
        });
        
        return result.value || { counts: { likes: '0', comments: '0', shares: '0', favorites: '0' } };
    }

    async getComments(limit = 50) {
        console.log('💬 Getting comments via MCP...');
        
        // Check if comments are open
        const isOpen = await this.callTool('puppeteer_evaluate', {
            script: `() => document.querySelector('[data-e2e="comment-list"]') !== null`
        });
        
        if (!isOpen.value) {
            // Open comments
            await this.callTool('puppeteer_click', {
                selector: '[data-e2e="comment-icon"], [data-e2e="video-comment-icon"]'
            });
            await this.wait(3000);
        }
        
        // Extract comments
        const result = await this.callTool('puppeteer_evaluate', {
            script: `(limit) => {
                const results = [];
                const commentElements = document.querySelectorAll('[data-e2e="comment-item"]');
                
                commentElements.forEach(container => {
                    const username = container.querySelector('[data-e2e="comment-username"]')?.textContent?.trim() || '';
                    const text = container.querySelector('[data-e2e="comment-text"]')?.textContent?.trim() || '';
                    const likes = container.querySelector('[data-e2e="comment-like-count"]')?.textContent?.trim() || '0';
                    
                    if (username && text) {
                        results.push({ username, text, likes });
                    }
                });
                
                return results.slice(0, limit);
            }`,
            args: [limit]
        });
        
        const comments = result.value || [];
        console.log(`📝 Found ${comments.length} comments`);
        return comments;
    }

    async postComment(text) {
        console.log('✍️ Posting comment via MCP...');
        
        try {
            // Ensure comments are open
            await this.getComments(1);
            
            // Click input
            await this.callTool('puppeteer_click', {
                selector: '[data-e2e="comment-input"], div[contenteditable="true"][data-e2e*="comment"]'
            });
            
            await this.wait(1000);
            
            // Clear and type
            await this.callTool('puppeteer_keyboard', {
                key: 'Control+A'
            });
            
            await this.callTool('puppeteer_type', {
                text: text,
                delay: 50
            });
            
            await this.wait(1000);
            
            // Submit
            const submitted = await this.callTool('puppeteer_click', {
                selector: '[data-e2e="comment-post"], button[type="submit"]:not([disabled])'
            });
            
            if (!submitted.success) {
                await this.callTool('puppeteer_keyboard', {
                    key: 'Enter'
                });
            }
            
            await this.wait(2000);
            
            // Close comments
            await this.callTool('puppeteer_keyboard', {
                key: 'Escape'
            });
            
            console.log('✅ Comment posted via MCP');
            return true;
        } catch (error) {
            console.error('❌ MCP comment error:', error);
            return false;
        }
    }

    async screenshot(options = {}) {
        const result = await this.callTool('puppeteer_screenshot', options);
        return result.data;
    }

    async executeScript(script) {
        const result = await this.callTool('puppeteer_evaluate', {
            script: typeof script === 'function' ? script.toString() : script
        });
        return result.value;
    }

    async checkForCaptcha() {
        const result = await this.callTool('puppeteer_evaluate', {
            script: `() => {
                const captchaSelectors = [
                    '.captcha-slider',
                    '#captcha-verify-image',
                    '[class*="captcha"]',
                    '[id*="captcha"]'
                ];
                
                for (const selector of captchaSelectors) {
                    const captcha = document.querySelector(selector);
                    if (captcha) {
                        const rect = captcha.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return true;
                        }
                    }
                }
                return false;
            }`
        });
        
        return result.value || false;
    }

    async disconnect() {
        if (this.mcpProcess) {
            console.log('🔌 Stopping MCP server...');
            
            // Clear pending requests
            this.pendingRequests.clear();
            
            // Close readline interface
            if (this.rl) {
                this.rl.close();
            }
            
            // Kill the process
            this.mcpProcess.kill();
            this.mcpProcess = null;
        }
        this.isConnected = false;
    }

    getName() {
        return 'MCPPuppeteer';
    }

    getDescription() {
        return 'Browser automation via Model Context Protocol (MCP)';
    }

    getCapabilities() {
        return {
            screenshots: true,
            javascript: true,
            stealth: false,
            ai: false,
            mcp: true
        };
    }
}

module.exports = MCPPuppeteerStrategy;