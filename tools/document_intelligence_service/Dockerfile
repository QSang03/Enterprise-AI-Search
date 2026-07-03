FROM python:3.10-slim

# Install system dependencies (OpenCV + libgomp for PaddlePaddle)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install paddlepaddle-gpu 3.x (CUDA 12.6 wheel is compatible with driver 550+/CUDA 13.0).
# Fallback to CPU if GPU wheel unavailable.
RUN pip install --no-cache-dir -r requirements.txt && \
    (pip install --no-cache-dir "paddlepaddle-gpu==3.2.1" \
        -i https://www.paddlepaddle.org.cn/packages/stable/cu126/ || \
     pip install --no-cache-dir "paddlepaddle>=3.0.0")

COPY . .

EXPOSE 8090
ENV PORT=8090
ENV USE_GPU=True

CMD ["python", "main.py"]
