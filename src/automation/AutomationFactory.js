const DirectPuppeteerStrategy = require('./strategies/DirectPuppeteerStrategy');
const MCPPuppeteerStrategy = require('./strategies/MCPPuppeteerStrategy');

/**
 * Factory for creating automation strategies
 */
class AutomationFactory {
    static strategies = {
        'direct': DirectPuppeteerStrategy,
        'mcp': MCPPuppeteerStrategy
    };

    /**
     * Get available strategies
     * @returns {Array} List of strategy info
     */
    static getAvailableStrategies() {
        return Object.entries(this.strategies).map(([key, Strategy]) => {
            const instance = new Strategy();
            return {
                key,
                name: instance.getName(),
                description: instance.getDescription(),
                capabilities: instance.getCapabilities()
            };
        });
    }

    /**
     * Create an automation strategy
     * @param {string} type - Strategy type (direct, mcp)
     * @param {Object} config - Configuration options
     * @returns {AutomationStrategy} Strategy instance
     */
    static create(type = 'direct', config = {}) {
        const Strategy = this.strategies[type];
        
        if (!Strategy) {
            throw new Error(`Unknown automation strategy: ${type}`);
        }

        // Add default config based on environment
        const defaultConfig = {
            chromeWSEndpoint: process.env.CHROME_WS_ENDPOINT,
            chromeEndpoint: process.env.CHROME_ENDPOINT,
            ...config
        };

        console.log(`🏭 Creating ${type} automation strategy`);
        return new Strategy(defaultConfig);
    }

    /**
     * Check if MCP is available
     * @returns {boolean}
     */
    static async checkMCPAvailability() {
        try {
            const { execSync } = require('child_process');
            execSync('npx -y @modelcontextprotocol/server-puppeteer --version', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create the best available strategy
     * @param {Object} config - Configuration options
     * @returns {AutomationStrategy} Strategy instance
     */
    static async createBestAvailable(config = {}) {
        // Check MCP availability
        const mcpAvailable = await this.checkMCPAvailability();
        
        console.log('🔍 Checking available strategies...');
        console.log(`   Direct Puppeteer: ✅`);
        console.log(`   MCP Puppeteer: ${mcpAvailable ? '✅' : '❌'}`);
        
        // Use MCP if available and not disabled
        if (mcpAvailable && config.preferMCP !== false) {
            return this.create('mcp', config);
        }
        
        // Default to direct
        return this.create('direct', config);
    }
}

module.exports = AutomationFactory;