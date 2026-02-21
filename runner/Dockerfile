FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    xvfb \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (needed for docker exec to Selenium containers)
RUN curl -fsSL https://get.docker.com -o get-docker.sh \
    && sh get-docker.sh \
    && rm get-docker.sh \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install matching ChromeDriver - using latest stable version
RUN CHROME_MAJOR_VERSION=$(google-chrome --version | grep -oP '\d+' | head -1) \
    && echo "Chrome major version: $CHROME_MAJOR_VERSION" \
    && CHROMEDRIVER_VERSION=$(curl -s "https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_MAJOR_VERSION}") \
    && echo "ChromeDriver version: $CHROMEDRIVER_VERSION" \
    && wget -O /tmp/chromedriver-linux64.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROMEDRIVER_VERSION}/linux64/chromedriver-linux64.zip" \
    && unzip /tmp/chromedriver-linux64.zip -d /tmp/ \
    && mv /tmp/chromedriver-linux64/chromedriver /usr/local/bin/ \
    && chmod +x /usr/local/bin/chromedriver \
    && rm -rf /tmp/chromedriver* \
    && chromedriver --version

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY testscripts/ ./testscripts/

# Create output directories
RUN mkdir -p logs output/screenshots output/reports output/videos

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99
ENV CHROME_BIN=/usr/bin/google-chrome-stable
ENV CHROMEDRIVER_PATH=/usr/local/bin/chromedriver

# Start Xvfb and run the test runner
CMD Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset & \
    sleep 2 && \
    python src/runner.py
