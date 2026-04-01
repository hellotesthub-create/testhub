FROM python:3.11-slim

# Install system dependencies
# - curl: needed for Grid Hub API queries (video_recorder.py uses urllib, but curl useful for debugging)
# - Docker CLI: needed for 'docker exec' into Grid node containers (video recording via ffmpeg)
# - ffmpeg is NOT needed here — it runs inside the Selenium node containers
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (needed for docker exec to Selenium Grid node containers)
RUN curl -fsSL https://get.docker.com -o get-docker.sh \
    && sh get-docker.sh \
    && rm get-docker.sh \
    && rm -rf /var/lib/apt/lists/*

# Install JDK 17 for Java test script support
RUN apt-get update && apt-get install -y \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# NOTE: Chrome/ChromeDriver are NOT installed locally for Selenium mode.
# Selenium runner uses Remote WebDriver to connect to Selenium Grid Hub.
# Playwright installs its OWN browsers (bundled, no external grid needed).

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and its browser binaries (Chromium + Firefox)
# Playwright bundles browsers inside the container — no external grid needed
# Install browser deps manually (some packages renamed in Debian Trixie)
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 libxshmfence1 libx11-xcb1 \
    fonts-unifont fonts-liberation fonts-noto-color-emoji \
    libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir playwright==1.49.1 && \
    PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000 playwright install chromium firefox

# Set up Java Selenium + Playwright libraries
# Download Selenium Java JARs + Playwright Java JARs + all transitive dependencies
# Install Maven and download ALL transitive dependencies
RUN apt-get update && apt-get install -y maven && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /tmp/selenium-deps && \
    echo '<project><modelVersion>4.0.0</modelVersion><groupId>com.thex</groupId><artifactId>deps</artifactId><version>1.0</version><dependencies><dependency><groupId>org.seleniumhq.selenium</groupId><artifactId>selenium-java</artifactId><version>4.16.0</version></dependency><dependency><groupId>com.microsoft.playwright</groupId><artifactId>playwright</artifactId><version>1.49.0</version></dependency></dependencies></project>' > /tmp/selenium-deps/pom.xml && \
    cd /tmp/selenium-deps && \
    mvn dependency:copy-dependencies -DoutputDirectory=/app/java-libs -q && \
    rm -rf /tmp/selenium-deps /root/.m2

# Set JAVA_LIBS_DIR environment variable for the runner to find JARs
ENV JAVA_LIBS_DIR=/app/java-libs

# Copy source code
COPY src/ ./src/

# Copy Java helper classes
COPY java/ ./java/

COPY testscripts/ ./testscripts/

# Compile Java helper classes (BaseTest.java + PlaywrightBaseTest.java)
# Build classpath from all JARs, then compile
RUN mkdir -p /app/java-classes && \
    CP=$(find /app/java-libs -name "*.jar" -printf "%p:" 2>/dev/null) && \
    javac -cp "${CP}" -d /app/java-classes \
        /app/java/com/thex/BaseTest.java \
        /app/java/com/thex/PlaywrightBaseTest.java

# Create output directories
RUN mkdir -p logs output/screenshots output/reports output/videos

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV SELENIUM_HUB_URL=http://selenium-hub:4444
ENV JAVA_CLASSPATH=/app/java-classes:/app/java-libs/*
ENV FRAMEWORK=selenium
# Playwright: tell Java SDK where Python-installed browsers are, and skip auto-download
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Default command — just run the runner (no Xvfb needed, browsers run in Grid nodes for Selenium,
# or inside this container for Playwright)
CMD ["python", "src/runner.py"]
