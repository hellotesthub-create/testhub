FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./visual_regression/

EXPOSE 8002
# Multiple worker processes so concurrent compare requests fan out across CPU
# cores (the backend VRT pool calls /compare in parallel). Override with VR_WORKERS.
ENV VR_WORKERS=4
CMD ["sh", "-c", "uvicorn visual_regression.api:app --host 0.0.0.0 --port 8002 --workers ${VR_WORKERS:-4}"]
