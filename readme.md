# TikTok Bot - Automated Search & Engagement

A sophisticated TikTok automation bot with two automation modes: Direct Puppeteer and MCP (Model Context Protocol). Features AI-powered content analysis, human-like behavior simulation, and advanced CAPTCHA avoidance.

## 🌟 Features

- **Dual Automation Modes**:
  - **Direct Puppeteer**: Fast, reliable Chrome automation with stealth
  - **MCP Puppeteer**: Standardized browser automation via Model Context Protocol
- **Search-Based Navigation**: Search any topic on TikTok
- **AI Content Analysis**: GPT-4 powered relevance detection
- **Human-Like Behavior**: Random delays, mouse movements, typing simulation
- **CAPTCHA Detection**: Pauses for manual solving
- **Web Control Panel**: Real-time monitoring and control
- **SQLite Database**: Persistent data storage

## 🚀 Quick Start

### Prerequisites

- Node.js 14+
- Google Chrome
- OpenAI API key

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/yourusername/tiktok-bot.git
cd tiktok-bot
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Start Chrome with debugging**:
```bash
google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-stealth-session \
  --disable-blink-features=AutomationControlled \
  --window-size=1366,768
```

5. **Login to TikTok** in the Chrome instance

6. **Start the server**:
```bash
npm start
```

7. **Open control panel**: http://localhost:3000

## 🎮 Usage

### Web Interface

1. Choose automation mode:
   - **Direct Puppeteer** (recommended for beginners)
   - **MCP Puppeteer** (requires MCP server)

2. Enter search query (e.g., "remote work tips")

3. Click "Start Bot"

4. Monitor progress in real-time

### Command Line

```bash
# Direct mode (default)
node src/bot.js "job search tips"

# MCP mode
node src/bot.js "remote work" --strategy=mcp
```

## 🤖 Automation Modes

### Direct Puppeteer (Default)
- Direct Chrome control via Puppeteer
- Built-in stealth features
- No additional setup required
- Best performance

### MCP Puppeteer
- Uses Model Context Protocol
- Standardized interface
- Requires MCP server installation:
```bash
npm install -g @modelcontextprotocol/server-puppeteer
```

## 📁 Project Structure

```
tiktok-bot/
├── src/
│   ├── automation/
│   │   ├── AutomationStrategy.js      # Base strategy interface
│   │   ├── AutomationFactory.js       # Strategy factory
│   │   └── strategies/
│   │       ├── DirectPuppeteerStrategy.js  # Direct automation
│   │       └── MCPPuppeteerStrategy.js     # MCP automation
│   ├── bot.js                         # Main bot logic
│   ├── browser.js                     # Browser manager
│   ├── ai.js                          # AI analysis
│   ├── db.js                          # Database operations
│   ├── stealth.js                     # Stealth features
│   └── server.js                      # Express server
├── public/
│   └── index.html                     # Web interface
├── data/                              # SQLite database
├── .env.example                       # Environment template
└── package.json                       # Dependencies
```

## ⚙️ Configuration

Key settings in `.env`:

```bash
# Chrome connection
CHROME_ENDPOINT=http://localhost:9222

# OpenAI API
OPENAI_API_KEY=your_key_here

# Bot behavior
MIN_RELEVANCE_SCORE=0.7        # Minimum score to comment
COMMENT_DELAY_SECONDS=30        # Delay between comments
MAX_COMMENTS_PER_HOUR=20        # Rate limiting
```

## 🛡️ Stealth Features

- Browser fingerprint randomization
- Human-like mouse movements
- Typing with occasional typos
- Random delays and pauses
- Session breaks
- Selective video analysis (60%)
- Selective commenting (70% of relevant)

## 📊 Database Schema

**Videos Table**:
- Video ID, author, description
- Relevance score and category
- Processing timestamp

**Comments Table**:
- Comment text
- Success status
- Posted timestamp

**Sessions Table**:
- Start/end times
- Videos analyzed
- Comments posted

## 🚨 CAPTCHA Handling

When CAPTCHA is detected:
1. Bot automatically pauses
2. Banner appears in UI
3. Manually solve in Chrome
4. Bot resumes automatically

## 📈 Performance

- Processes ~30-50 videos/hour
- Comments on ~20-30% of videos
- 2-hour maximum session length
- Automatic breaks and delays

## 🔧 Troubleshooting

### Chrome won't connect
- Verify Chrome is running with `--remote-debugging-port=9222`
- Check firewall settings
- Try `CHROME_ENDPOINT` instead of `CHROME_WS_ENDPOINT`

### MCP not available
```bash
# Test MCP installation
npm run test-mcp

# Install if needed
npm install -g @modelcontextprotocol/server-puppeteer
```

### Bot not finding videos
- Check if logged into TikTok
- Try different search queries
- Clear cookies and re-login

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## 📄 License

MIT License - see LICENSE file

## ⚠️ Disclaimer

This bot is for educational purposes only. Use responsibly and in accordance with TikTok's Terms of Service. The authors are not responsible for any misuse or consequences of using this software.

## 🙏 Acknowledgments

- [Puppeteer](https://pptr.dev/) - Browser automation
- [Model Context Protocol](https://modelcontextprotocol.io) - Standardized AI-tool communication
- [OpenAI](https://openai.com) - AI content analysis
- [Express](https://expressjs.com/) - Web server