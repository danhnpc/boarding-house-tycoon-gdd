# Skill: Local-First IndexedDB & Save Migration
## Mục đích
Đảm bảo dữ liệu lưu trữ dưới local ổn định, an toàn và có khả năng nâng cấp cấu trúc save mượt mà khi game có các phiên bản cập nhật cấu trúc schema mới[cite: 2, 4].

## Nguyên tắc cốt lõi:
1. **Serializable GameState**: Chỉ lưu trữ dữ liệu dạng plain JSON (string, number, boolean, array, object) vào IndexedDB. Tuyệt đối không lưu Phaser Sprite, React nodes, class instances hay hàm[cite: 2].
2. **Schema Versioning**: Root state bắt buộc phải có trường `schemaVersion: number`[cite: 2].
3. **Migration Pipeline**: Khi đọc save cũ, nếu `schemaVersion` thấp hơn phiên bản hiện tại, hệ thống phải tự động chạy qua chuỗi các hàm migration tuần tự (ví dụ: v1 -> v2) đã được viết sẵn và unit-test cẩn thận[cite: 4].
4. **Autosave & Material Changes**: Kích hoạt lưu trữ save ngay lập tức sau các hành động thay đổi trạng thái quan trọng (build, upgrade, accept/reject candidate, resolve event, nhận thưởng mission) và chạy định kỳ autosave mỗi 60 giây[cite: 4].