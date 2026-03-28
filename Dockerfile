# Dockerfile — installs Node.js + ffmpeg + yt-dlp for Railway deployment

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp (more reliable than streamlink for Twitch)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

CMD ["node", "index.js"]
