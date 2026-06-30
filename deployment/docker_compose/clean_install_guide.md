# Hướng dẫn Clean Install Hệ thống Onyx (On-Premise)

Tài liệu này hướng dẫn chi tiết cách cài đặt sạch toàn bộ hệ thống Onyx trên một máy chủ Ubuntu trắng chỉ bằng một câu lệnh duy nhất.

---

## 1. Yêu cầu Hệ thống tối thiểu

- **Hệ điều hành**: Ubuntu 20.04 LTS hoặc 22.04 LTS sạch.
- **Cấu hình tối thiểu**: 4 Cores CPU, 8 GB RAM, 50 GB ổ cứng trống.
- **Cấu hình khuyến nghị**: 8 Cores CPU, 16 GB RAM, 100 GB SSD trống.
- **Kết nối mạng**: Quyền tải ảnh Docker từ Docker Hub.

---

## 2. Cài đặt Docker & Docker Compose (Nếu chưa có)

Nếu máy chủ Ubuntu của bạn chưa được cài đặt Docker, hãy chạy các lệnh sau:

```bash
# Cập nhật danh sách gói và cài đặt dependencies
sudo apt-get update && sudo apt-get install -y curl gnupg lsb-release

# Thêm khóa GPG chính thức của Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Thiết lập repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài đặt Docker Engine và Docker Compose
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Khởi động dịch vụ Docker
sudo systemctl enable docker && sudo systemctl start docker
```

---

## 3. Khởi động Toàn bộ Hệ thống bằng Một Lệnh

Truy cập thư mục chứa cấu hình Docker Compose và khởi động tất cả các service nền tảng (Postgres, Vespa, Redis, Celery, API Server, UI/Nginx):

```bash
# Di chuyển tới thư mục docker_compose
cd deployment/docker_compose

# Khởi động hệ thống ở chế độ chạy ngầm (detached mode)
docker compose up -d
```

### Các dịch vụ được khởi chạy tự động:
1. **onyx-relational_db-1 (Postgres)**: Lưu trữ thông tin người dùng, cài đặt, siêu dữ liệu tài liệu, và logs.
2. **onyx-vespa-1 (Vespa)**: Vector database và công cụ tìm kiếm keyword/hybrid.
3. **onyx-redis-cache-1 (Redis)**: Caching và điều phối hàng đợi tác vụ Celery.
4. **onyx-celery_worker (Celery primary, light, heavy)**: Xử lý đồng bộ hóa tài liệu và cập nhật dữ liệu nền.
5. **onyx-api_server-1**: FastAPI Backend xử lý các truy vấn nghiệp vụ.
6. **onyx-web_server-1 (Nginx + UI)**: Giao diện Next.js chạy trên cổng `3000`.

---

## 4. Kiểm tra Trạng thái Cài đặt

Chạy lệnh sau để đảm bảo tất cả các container đều ở trạng thái `Up`:

```bash
docker compose ps
```

Sau khi hệ thống sẵn sàng, bạn có thể truy cập giao diện Onyx tại địa chỉ: `http://<IP-MÁY-CHỦ>:3000` và thực hiện đăng ký tài khoản Admin đầu tiên.
