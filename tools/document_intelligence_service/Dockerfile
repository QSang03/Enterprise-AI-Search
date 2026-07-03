FROM python:3.10-slim

# Install system dependencies (OpenCV + libgomp for ONNX/OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8090
ENV PORT=8090
ENV USE_GPU=False

CMD ["python", "main.py"]
