# Hướng dẫn Vận hành Backup & Restore Onyx (On-Premise)

Tài liệu này hướng dẫn chi tiết cách sao lưu (backup) và khôi phục (restore) toàn bộ dữ liệu của hệ thống Onyx bao gồm Cơ sở dữ liệu Postgres, Vector Database Vespa, và Kho lưu trữ tệp tin (MinIO/S3).

---

## 1. Sao lưu Hệ thống (Backup)

Thực hiện sao lưu định kỳ để tránh mất mát dữ liệu khi hệ thống gặp sự cố.

### A. Sao lưu Cơ sở dữ liệu Postgres
Postgres lưu trữ toàn bộ người dùng, quyền truy cập, các trang Wiki, thực thể đồ thị, lịch sử chat và cấu hình hệ thống.

Sử dụng tiện ích CLI `ods` đi kèm hoặc sử dụng lệnh `pg_dump` trực tiếp từ container:

**Cách 1: Sử dụng Docker pg_dump trực tiếp**
```bash
# Tạo file backup dạng nén tự sinh
docker exec -t onyx-relational_db-1 pg_dump -U postgres -F c postgres > backup_postgres_$(date +%F).dump
```

**Cách 2: Sử dụng công cụ CLI `ods`**
```bash
# Chạy công cụ CLI dump tự động tìm container
ods db dump backup_postgres_$(date +%F).dump
```

---

### B. Sao lưu Tài liệu tải lên (MinIO / S3 Storage)
Toàn bộ các tệp tin do người dùng tải lên, ảnh chụp và tài liệu nguồn được lưu trữ trong volume của dịch vụ lưu trữ đối tượng (MinIO).

Sao lưu bằng cách đóng gói volume dữ liệu:
```bash
# Nén thư mục volume lưu trữ đối tượng của docker-compose
sudo tar -czvf backup_minio_$(date +%F).tar.gz -C /var/lib/docker/volumes/docker_compose_onyx_file_store/_data .
```

---

### C. Sao lưu Chỉ mục Vespa (Vector Database)
Vespa lưu trữ các chunk tài liệu đã được nhúng (embeddings) để phục vụ tìm kiếm.

**Khuyến nghị:** Cách an toàn và sạch sẽ nhất để khôi phục Vespa là để hệ thống tự động lập lại chỉ mục (Re-index) từ cơ sở dữ liệu Postgres sau khi đã khôi phục thành công Postgres và MinIO. 

Nếu muốn sao lưu dữ liệu Vespa vật lý trực tiếp:
```bash
# Nén thư mục dữ liệu của Vespa container
sudo tar -czvf backup_vespa_$(date +%F).tar.gz -C /var/lib/docker/volumes/docker_compose_vespa_var/_data .
```

---

## 2. Khôi phục Hệ thống (Restore)

Khi cần phục hồi hệ thống về trạng thái đã sao lưu trước đó.

### A. Khôi phục Cơ sở dữ liệu Postgres
Trước khi khôi phục, hãy đảm bảo hệ thống Onyx đang chạy sạch (nếu khôi phục đè, nên làm sạch database hiện tại).

**Khôi phục trực tiếp qua Docker `pg_restore`:**
```bash
# Sao chép tệp sao lưu vào container Postgres
docker cp backup_postgres_xxxx.dump onyx-relational_db-1:/tmp/

# Thực thi khôi phục đè (yêu cầu dọn dẹp các bảng cũ trước)
docker exec -t onyx-relational_db-1 pg_restore -U postgres -d postgres --clean --no-owner /tmp/backup_postgres_xxxx.dump
```

---

### B. Khôi phục Tài liệu tải lên (MinIO Storage)
Giải nén lưu trữ MinIO về đúng thư mục volume đích:
```bash
# Đảm bảo dừng các container trước khi thay đổi volume dữ liệu
docker compose down

# Giải nén đè dữ liệu tệp tin cũ
sudo tar -xzvf backup_minio_xxxx.tar.gz -C /var/lib/docker/volumes/docker_compose_onyx_file_store/_data

# Khởi động lại hệ thống
docker compose up -d
```

---

### C. Đồng bộ chỉ mục tìm kiếm và Đồ thị quan hệ (Vespa / Graph-RAG)
Sau khi khôi phục hoàn tất Postgres và MinIO, hãy kích hoạt tiến trình lập lại chỉ mục toàn bộ tài liệu nguồn để đồng bộ chính xác dữ liệu vào Vespa và bóc tách lại đồ thị quan hệ:

1. Đăng nhập vào giao diện Onyx với tư cách Admin.
2. Truy cập **Admin Panel** > **Connectors** > **Reindex All Connectors**.
3. Hệ thống sẽ tự động nạp tài liệu từ MinIO, cắt nhỏ (chunking), tạo vector nhúng (embedding), cập nhật Vespa chỉ mục tìm kiếm và tái lập sơ đồ Graph-RAG đệ quy.
