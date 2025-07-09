require('dotenv').config();
const express = require('express');
const path = require('path');
const Bot = require('./bot');
const db = require('./db');
const AutomationFactory = require('./automation/AutomationFactory');

const app = express();
const PORT = process.env.PORT || 3000;

// Bot instance
let bot = null;
let currentSearch = null;
let currentStrategy = null;
let currentMode = null;
// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        running: bot && bot.isRunning,
        sessionId: bot?.sessionId,
        stats: bot?.stats || { videos: 0, comments: 0 },
        captchaDetected: bot?.getCaptchaStatus() || false,
        currentSearch: currentSearch,
        currentStrategy: currentStrategy,
        lastAction: bot?.lastAction || null
    });
});

app.get('/api/strategies', async (req, res) => {
    try {
        const strategies = AutomationFactory.getAvailableStrategies();
        
        // Check actual availability
        const mcpAvailable = await AutomationFactory.checkMCPAvailability();
        
        // Add availability info
        strategies.forEach(strategy => {
            if (strategy.key === 'mcp') {
                strategy.available = mcpAvailable;
                strategy.requirements = mcpAvailable ? [] : ['MCP server not installed'];
            } else {
                strategy.available = true;
                strategy.requirements = [];
            }
        });
        
        res.json(strategies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/start', async (req, res) => {
    try {
        if (bot && bot.isRunning) {
            return res.status(400).json({ error: 'Bot already running' });
        }
        
        const { searchQuery, automationStrategy = 'direct', autoSelectBest = false } = req.body;
        
        if (!searchQuery || !searchQuery.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        currentSearch = searchQuery;
        currentStrategy = automationStrategy;
        bot = new Bot();
        
        // Start bot with selected strategy
        bot.start({ 
            searchQuery,
            automationStrategy,
            autoSelectBest
        }).catch(error => {
            console.error('Bot error:', error);
            bot.lastAction = `Error: ${error.message}`;
        });
        
        // Wait a bit for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        res.json({ 
            success: true, 
            message: 'Bot started',
            searchQuery,
            automationStrategy: autoSelectBest ? 'auto' : automationStrategy
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop', async (req, res) => {
    try {
        if (!bot || !bot.isRunning) {
            return res.status(400).json({ error: 'Bot not running' });
        }
        
        await bot.stop();
        currentSearch = null;
        currentStrategy = null;
        res.json({ success: true, message: 'Bot stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/videos', async (req, res) => {
    try {
        const videos = await db.getRecentVideos(10);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/comments', async (req, res) => {
    try {
        const comments = await db.getRecentComments(10);
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`🤖 Available automation strategies:`);
    
    AutomationFactory.getAvailableStrategies().forEach(strategy => {
        console.log(`   - ${strategy.name}: ${strategy.description}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down...');
    
    if (bot && bot.isRunning) {
        await bot.stop();
    }
    
    db.close();
    process.exit(0);
});