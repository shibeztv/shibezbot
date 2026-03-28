# Dockerfile — installs Node.js + ffmpeg + streamlink for Railway deployment

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install streamlink via pip (into a venv to avoid system conflicts)
RUN python3 -m venv /opt/streamlink-venv && \
    /opt/streamlink-venv/bin/pip install --no-cache-dir streamlink

# Make streamlink available globally
RUN ln -s /opt/streamlink-venv/bin/streamlink /usr/local/bin/streamlink

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

CMD ["node", "index.js"]
