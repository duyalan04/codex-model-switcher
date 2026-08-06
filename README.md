# Codex Model Switcher

Ứng dụng Windows giúp chọn model Codex qua 9Router, thay đổi reasoning effort, theo dõi usage/quota và nhận thông báo cập nhật phiên bản mới.

## Tính năng

- Đọc và cập nhật cấu hình Codex tại `%USERPROFILE%\.codex\config.toml`.
- Hiển thị các model nằm trong combo của 9Router.
- Đổi model chính và reasoning effort mà vẫn giữ Codex chạy qua `model = "combo"`.
- Khởi động, dừng và khởi động lại 9Router ngay trong ứng dụng.
- Hiển thị tổng số request, chi phí, token và quota còn lại của từng tài khoản Codex.
- Tự kiểm tra phiên bản mới trên GitHub khi mở ứng dụng.
- Nút **Update now** tự tải và cài đè bản mới vào đúng thư mục hiện tại.

## Yêu cầu

- Windows 10 hoặc Windows 11 x64.
- 9Router đã được cài đặt và có ít nhất một connection Codex hoạt động.
- Codex CLI đã có file `%USERPROFILE%\.codex\config.toml`.
- Internet để tải quota và kiểm tra bản cập nhật.

## Cài đặt

1. Mở trang [Releases](https://github.com/duyalan04/codex-model-switcher/releases/latest).
2. Tải file `codex-model-switcher_<version>_x64-setup.exe`.
3. Chạy installer và chọn thư mục cài đặt nếu muốn.
4. Nếu Windows SmartScreen cảnh báo vì ứng dụng chưa được ký số, chọn **More info** → **Run anyway**.

Installer mặc định cài cho tài khoản Windows hiện tại. Khi cập nhật, ứng dụng nhớ vị trí cũ và cài đè, không tạo thêm bản trùng.

## Cách sử dụng

### 1. Kết nối 9Router

- Mở 9Router và đảm bảo có connection Codex đang hoạt động.
- Mở Codex Model Switcher.
- Thanh trạng thái phía dưới cần hiển thị:
  - **Config OK**: đọc được cấu hình Codex.
  - **Connected**: kết nối được tới 9Router.
  - **N up / N combos**: số model và combo đã tải được.

Nếu bật **Auto-start with app**, ứng dụng sẽ tự chạy lệnh `9router` khi mở.

### 2. Chọn model

1. Chọn model trong **Target Model**.
2. Chọn mức suy luận trong **Reasoning Effort**.
3. Bấm **Apply Changes**.

Ứng dụng sẽ:

- Đưa model được chọn lên đầu combo tương ứng trong database 9Router.
- Lưu tên combo vào cấu hình Codex.
- Ghi reasoning effort vào `%USERPROFILE%\.codex\config.toml`.

Mở phiên Codex mới sau khi đổi model để chắc chắn Codex nạp lại cấu hình.

### 3. Điều khiển router

- **Play**: khởi động 9Router.
- **Stop**: dừng tiến trình router.
- **Restart**: khởi động lại router.
- **Settings**: cấu hình lệnh khởi động, timeout và chu kỳ kiểm tra trạng thái.

### 4. Theo dõi quota

Panel **Actual Usage (DB)** hiển thị:

- Tổng số calls, chi phí và token đã sử dụng.
- Quota còn lại của từng tài khoản Codex.
- Thời gian còn lại trước khi quota reset.
- Usage được tổng hợp theo từng connection.

Bấm biểu tượng refresh để tải lại dữ liệu. Nếu thấy `Quota HTTP 401`, hãy refresh hoặc đăng nhập lại connection đó trong 9Router.

## Cập nhật ứng dụng

Ứng dụng tự kiểm tra release mới mỗi lần mở. Khi có phiên bản mới:

1. Banner **Update available** xuất hiện ở đầu cửa sổ.
2. Bấm **Update now**.
3. Ứng dụng tải installer, tự đóng và cài đè vào đúng thư mục cũ.
4. Mở lại ứng dụng sau khi installer hoàn tất.

Model, combo, connection và cấu hình router không bị mất vì chúng nằm trong dữ liệu của 9Router tại `%APPDATA%\9router`.

## Xử lý lỗi

### Config Error

Kiểm tra file `%USERPROFILE%\.codex\config.toml` có tồn tại và là TOML hợp lệ. Cấu hình 9Router cơ bản:

```toml
model = "combo"
model_provider = "9router"

[model_providers.9router]
base_url = "http://127.0.0.1:20128/v1"
wire_api = "responses"
```

### Router Error hoặc không có model

- Mở 9Router và kiểm tra endpoint `http://127.0.0.1:20128/v1`.
- Đảm bảo connection Codex đang bật và chưa hết phiên đăng nhập.
- Bấm Restart hoặc Refresh trong ứng dụng.

### Không thấy thông báo cập nhật

- Đảm bảo đang dùng phiên bản có chức năng updater.
- Kiểm tra GitHub release mới nhất có attach cả installer và `latest.json`.
- Repo GitHub phải public để ứng dụng tải manifest mà không cần token.

## Dành cho người phát hành

Yêu cầu một lần:

```powershell
gh auth login
```

Đóng ứng dụng rồi phát hành bằng một lệnh:

```powershell
powershell -ExecutionPolicy Bypass -File .\release.ps1 0.3.0 "Mô tả thay đổi"
```

Script tự động:

1. Cập nhật version trong `package.json`, `src-tauri/Cargo.toml` và `src-tauri/tauri.conf.json`.
2. Tạo lại `latest.json`.
3. Build installer NSIS.
4. Commit, tạo tag và push lên GitHub.
5. Tạo GitHub Release và upload installer cùng `latest.json`.

Dùng `-NoPublish` nếu chỉ muốn build mà không tạo release:

```powershell
powershell -ExecutionPolicy Bypass -File .\release.ps1 0.3.0 "Mô tả" -NoPublish
```

## Phát triển

```powershell
npm install
npm run tauri dev
```

Kiểm tra trước khi phát hành:

```powershell
node node_modules\typescript\bin\tsc --noEmit
cargo test --manifest-path src-tauri\Cargo.toml
cargo clippy --manifest-path src-tauri\Cargo.toml --lib --all-targets
npm run build
```
