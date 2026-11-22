# Chạy toàn bộ CongNghePhanMem bằng Docker Compose (Windows)


## 1. Kiểm tra dữ liệu Docker hiện có trước khi chuyển

Nếu bạn từng chạy thủ công như hướng dẫn trước, các container cũ có tên
`cnpm-db`, `cnpm-backend`, dùng volume `cnpm-db-data` và `cnpm-backend-cache`.
Chạy trong PowerShell tại thư mục gốc dự án:

```powershell
docker inspect cnpm-db --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker inspect cnpm-backend --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker volume ls
```

Compose sử dụng **đúng hai tên volume đó**. Nếu volume cũ của bạn tên khác,
hãy sửa phần `volumes:` cuối `docker-compose.yml` trước khi khởi động,
không xóa volume cũ. Tắt phiên `npm run web` hiện đang dùng cổng 8081 (`Ctrl+C`).

## 2. Chuẩn bị biến môi trường

```powershell
Copy-Item .env.example .env
```

Sửa `.env`: `POSTGRES_PASSWORD` phải chính là mật khẩu hiện có trong database cũ;
trong hướng dẫn chạy Docker thủ công trước đó, mật khẩu ví dụ là `DevPassword123!`.
Nếu dùng mật khẩu khác, nhập mật khẩu đã chọn. Dùng mật khẩu URL-safe (A-Z a-z 0-9 _ . ! -)
vì nó được đặt trong chuỗi kết nối PostgreSQL.
```dotenv
DEMO_ACCOUNTS_ENABLED=true
DEMO_ADMIN_EMAIL=admin@example.com
DEMO_ADMIN_PASSWORD=Admin@123
DEMO_GUEST_EMAIL=khach@example.com
DEMO_GUEST_PASSWORD=Khach@123
```

Tài khoản mẫu sau khi seed thành công:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị viên | `admin@example.com` | `Admin@123` |
| Khách | `khach@example.com` | `Khach@123` |


Tạo `SECRET_KEY` ngẫu nhiên (PowerShell):

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = [Convert]::ToBase64String($bytes)
(Get-Content .env) -replace '^SECRET_KEY=.*$', "SECRET_KEY=$secret" | Set-Content .env
```

**Giữ cố định SECRET_KEY sau khi cấu hình.** Thay khóa sẽ khiến các phiên JWT hiện tại phải đăng nhập lại.
Không đưa file `.env` vào Git. `.gitignore` gốc đã loại trừ file này.

## 3. Dừng các container cũ (không xóa dữ liệu)

```powershell
docker stop cnpm-backend cnpm-db
```

Để giữ dữ liệu, **không chạy** `docker volume rm`, `docker compose down -v`
hoặc `docker system prune --volumes`.

## 4. Chạy toàn bộ

```powershell
docker compose config --quiet
docker compose up -d --build
```

Kiểm tra:

```powershell
docker compose ps
docker compose logs --tail=80 migrate
docker compose logs --tail=80 backend
```

- Frontend: http://localhost:8081
- Dashboard: http://localhost:8081/admin
- Backend: http://localhost:8000/docs
- Readiness: http://localhost:8000/health/ready

Nếu website hiện nhưng không có địa điểm, hãy kiểm tra lại **volume database**
và số bản ghi trước khi chạy bất kỳ script nhập liệu nào.
# Cần đọc kĩ
## 5. Những lần sau

```powershell
docker compose up -d
# Xem logs
docker compose logs -f backend
# Dừng và giữ volume
docker compose down
```

Đối với máy clone mới, cần file `.env` riêng, Docker Desktop và các volume được
tạo tự động. Dữ liệu Quận 1 không tự xuất hiện cho tới khi được nhập bằng công cụ
được ghi trong README gốc. Tài khoản mẫu được tạo bởi `seed_demo_accounts` chỉ
khi `DEMO_ACCOUNTS_ENABLED=true` và database chưa có người dùng nào.


