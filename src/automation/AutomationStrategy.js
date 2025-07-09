/**
 * Base interface for automation strategies
 * All automation approaches must implement this interface
 */
class AutomationStrategy {
    constructor(config = {}) {
        this.config = config;
        this.isConnected = false;
    }

    /**
     * Initialize the automation strategy
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Navigate to a URL
     * @param {string} url - The URL to navigate to
     */
    async navigate(url) {
        throw new Error('navigate() must be implemented by subclass');
    }

    /**
     * Search on TikTok
     * @param {string} query - Search query
     */
    async searchTikTok(query) {
        throw new Error('searchTikTok() must be implemented by subclass');
    }

    /**
     * Check if user is logged in
     * @returns {boolean}
     */
    async checkLogin() {
        throw new Error('checkLogin() must be implemented by subclass');
    }

    /**
     * Extract videos from current page
     * @returns {Array} Array of video objects
     */
    async extractVideos() {
        throw new Error('extractVideos() must be implemented by subclass');
    }

    /**
     * Scroll to next video or content
     */
    async scrollToNext() {
        throw new Error('scrollToNext() must be implemented by subclass');
    }

    /**
     * Get video engagement details
     * @returns {Object} Video stats
     */
    async getVideoDetails() {
        throw new Error('getVideoDetails() must be implemented by subclass');
    }

    /**
     * Get comments from current video
     * @param {number} limit - Max comments to retrieve
     * @returns {Array} Array of comments
     */
    async getComments(limit = 50) {
        throw new Error('getComments() must be implemented by subclass');
    }

    /**
     * Post a comment
     * @param {string} text - Comment text
     * @returns {boolean} Success status
     */
    async postComment(text) {
        throw new Error('postComment() must be implemented by subclass');
    }

    /**
     * Take a screenshot
     * @param {Object} options - Screenshot options
     * @returns {Buffer|string} Screenshot data
     */
    async screenshot(options = {}) {
        throw new Error('screenshot() must be implemented by subclass');
    }

    /**
     * Execute JavaScript in browser context
     * @param {string|Function} script - Script to execute
     * @returns {*} Script result
     */
    async executeScript(script) {
        throw new Error('executeScript() must be implemented by subclass');
    }

    /**
     * Check for CAPTCHA
     * @returns {boolean}
     */
    async checkForCaptcha() {
        throw new Error('checkForCaptcha() must be implemented by subclass');
    }

    /**
     * Wait for a duration
     * @param {number} ms - Milliseconds to wait
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup and disconnect
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Get strategy name
     * @returns {string}
     */
    getName() {
        return this.constructor.name;
    }

    /**
     * Get strategy description
     * @returns {string}
     */
    getDescription() {
        return 'Base automation strategy';
    }

    /**
     * Get strategy capabilities
     * @returns {Object}
     */
    getCapabilities() {
        return {
            screenshots: false,
            javascript: false,
            stealth: false,
            ai: false,
            mcp: false
        };
    }
}

module.exports = AutomationStrategy;