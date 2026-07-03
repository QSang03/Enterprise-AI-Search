FROM python:3.10-slim

# Install system dependencies (OpenCV requirements and libgomp for PaddlePaddle)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install pip requirements, then try installing paddlepaddle-gpu for CUDA 12.0.
# Fallback to standard paddlepaddle (CPU version) if GPU package fails.
RUN pip install --no-cache-dir -r requirements.txt && \
    (pip install --no-cache-dir "paddlepaddle-gpu>=2.6.2" -i https://www.paddlepaddle.org.cn/packages/stable/cu120/ || \
     pip install --no-cache-dir "paddlepaddle>=2.6.2")

COPY . .

EXPOSE 8090
ENV PORT=8090
ENV USE_GPU=True

CMD ["python", "main.py"]
