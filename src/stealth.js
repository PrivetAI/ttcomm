// Stealth features for human-like behavior
class StealthFeatures {
    constructor() {
        this.lastActionTime = Date.now();
        this.actionCount = 0;
    }

    // Random delay between min and max
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Human-like delay based on action type
    async humanDelay(actionType = 'default') {
        const delays = {
            'typing': { min: 50, max: 150 },
            'beforeClick': { min: 300, max: 800 },
            'afterClick': { min: 1000, max: 2000 },
            'scrolling': { min: 2000, max: 4000 },
            'reading': { min: 3000, max: 6000 },
            'beforeComment': { min: 2000, max: 4000 },
            'default': { min: 500, max: 1500 }
        };

        const delay = delays[actionType] || delays.default;
        const ms = this.randomDelay(delay.min, delay.max);
        
        // Add micro-pauses occasionally
        if (Math.random() < 0.1) {
            await this.wait(this.randomDelay(100, 300));
        }
        
        await this.wait(ms);
    }

    // Simulate human-like mouse movement
    async humanMouseMove(page, element) {
        try {
            const box = await element.boundingBox();
            if (!box) return;

            // Start from current position or random spot
            const startX = Math.random() * 800;
            const startY = Math.random() * 600;

            // Create curved path to element
            const steps = this.randomDelay(3, 6);
            for (let i = 0; i <= steps; i++) {
                const progress = i / steps;
                // Bezier curve for natural movement
                const easeProgress = progress * progress * (3 - 2 * progress);
                
                const x = startX + (box.x + box.width / 2 - startX) * easeProgress;
                const y = startY + (box.y + box.height / 2 - startY) * easeProgress;
                
                // Add small random jitter
                const jitterX = (Math.random() - 0.5) * 2;
                const jitterY = (Math.random() - 0.5) * 2;
                
                await page.mouse.move(x + jitterX, y + jitterY);
                await this.wait(this.randomDelay(10, 30));
            }

            // Hover briefly
            await this.wait(this.randomDelay(100, 300));
        } catch (error) {
            // Silent fail - element might have moved
        }
    }

    // Human-like typing with occasional typos
    async humanType(page, text, makeTypos = true) {
        const chars = text.split('');
        
        for (let i = 0; i < chars.length; i++) {
            // Occasionally make a typo and correct it
            if (makeTypos && Math.random() < 0.02 && i > 0 && i < chars.length - 1) {
                const wrongChar = String.fromCharCode(chars[i].charCodeAt(0) + 1);
                await page.keyboard.type(wrongChar);
                await this.wait(this.randomDelay(100, 300));
                await page.keyboard.press('Backspace');
                await this.wait(this.randomDelay(50, 150));
            }
            
            await page.keyboard.type(chars[i]);
            
            // Variable typing speed
            const baseDelay = this.randomDelay(50, 150);
            const variableDelay = Math.random() < 0.1 ? baseDelay * 2 : baseDelay;
            await this.wait(variableDelay);
            
            // Occasional pause (thinking)
            if (Math.random() < 0.05) {
                await this.wait(this.randomDelay(300, 800));
            }
        }
    }

    // Simulate reading time based on text length
    async simulateReading(text) {
        const wordsPerMinute = this.randomDelay(180, 250);
        const words = text.split(' ').length;
        const readingTime = (words / wordsPerMinute) * 60 * 1000;
        const actualTime = this.randomDelay(
            Math.max(1000, readingTime * 0.7),
            readingTime * 1.3
        );
        await this.wait(actualTime);
    }

    // Random scroll patterns
    async humanScroll(page, direction = 'down') {
        const scrollAmount = this.randomDelay(100, 300);
        const smoothness = this.randomDelay(3, 7);
        
        for (let i = 0; i < smoothness; i++) {
            const partialScroll = scrollAmount / smoothness;
            await page.evaluate((scroll, dir) => {
                if (dir === 'down') {
                    window.scrollBy(0, scroll);
                } else {
                    window.scrollBy(0, -scroll);
                }
            }, partialScroll, direction);
            await this.wait(this.randomDelay(50, 150));
        }
    }

    // Session timing management
    async checkSessionTiming() {
        this.actionCount++;
        const sessionDuration = Date.now() - this.lastActionTime;
        
        // Take a break after extended activity
        if (this.actionCount > 50 && Math.random() < 0.1) {
            console.log('😴 Taking a human break...');
            const breakTime = this.randomDelay(30000, 120000); // 30s - 2min
            await this.wait(breakTime);
            this.actionCount = 0;
        }
        
        // Micro-breaks
        if (this.actionCount % 10 === 0) {
            await this.wait(this.randomDelay(5000, 15000));
        }
    }

    // Randomize action order occasionally
    shouldRandomizeAction(probability = 0.2) {
        return Math.random() < probability;
    }

    // Simulate distracted behavior
    async simulateDistraction(page) {
        if (Math.random() < 0.05) { // 5% chance
            console.log('👀 Simulating distraction...');
            
            // Random mouse movements
            for (let i = 0; i < this.randomDelay(2, 4); i++) {
                await page.mouse.move(
                    this.randomDelay(100, 700),
                    this.randomDelay(100, 500)
                );
                await this.wait(this.randomDelay(500, 1500));
            }
            
            // Maybe scroll a bit
            if (Math.random() < 0.5) {
                await this.humanScroll(page, Math.random() < 0.5 ? 'up' : 'down');
            }
        }
    }

    // Enhanced wait with variance
    wait(ms) {
        // Add 10% variance to all waits
        const variance = ms * 0.1;
        const actualMs = ms + (Math.random() - 0.5) * variance;
        return new Promise(resolve => setTimeout(resolve, Math.max(0, actualMs)));
    }

    // Get random viewport (but consistent per session as requested)
    getSessionViewport() {
        // Return consistent viewport for the session
        return {
            width: 1366,
            height: 768,
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false
        };
    }

    // Browser fingerprint randomization
    async setupStealthMode(page) {
        // Override navigator properties
        await page.evaluateOnNewDocument(() => {
            // Webdriver flag
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // Chrome flag
            window.chrome = {
                runtime: {}
            };

            // Permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Platform
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32'
            });

            // Hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8
            });

            // Device memory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8
            });
        });

        // Set realistic user agent
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        await page.setUserAgent(userAgent);

        // Set viewport
        const viewport = this.getSessionViewport();
        await page.setViewport(viewport);

        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
    }
}

module.exports = StealthFeatures;