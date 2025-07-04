FROM node:18-slim

WORKDIR /app

# Install build tools for native modules (like sqlite3) and puppeteer dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    # Puppeteer dependencies
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install nodemon globally
RUN npm install -g nodemon

# Create user for security
# RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
#     && mkdir -p /home/pptruser/Downloads \
#     && chown -R pptruser:pptruser /home/pptruser

# Create app directories
RUN mkdir -p /app/data /app/browser_data /app/logs /app/temp

# Use a build argument to conditionally skip Chromium download
ARG SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=${SKIP_CHROMIUM_DOWNLOAD}

# Switch to non-root user
# USER pptruser

# Install dependencies first
COPY package*.json ./
RUN npm install

# Copy application files AFTER npm install
COPY . .

EXPOSE 3000

CMD ["nodemon", "src/api/server.js"]
