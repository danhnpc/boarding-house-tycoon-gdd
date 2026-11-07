# Skill: Game Domain Pure Logic
## Mục đích
Đảm bảo toàn bộ logic cốt lõi của game (kinh tế, tenant matching, event selection, tính toán thời gian, mission) được viết bằng **pure TypeScript**, hoàn toàn tách biệt khỏi React hooks, Phaser engine, Zustand hay IndexedDB.

## Nguyên tắc cốt lõi:
1. **Framework-agnostic**: Tuyệt đối không được import `react`, `phaser`, `zustand`, hoặc `@capacitor/*` trong thư mục `src/domain/`[cite: 2].
2. **Currency Precision (Minor Units)**: Store tiền tệ nội bộ bằng số nguyên (minor units, ví dụ: 100 minor units = 1 Cash hiển thị) để tránh triệt để lỗi làm tròn dấu phẩy động (floating-point precision errors) khi tính toán dòng tiền liên tục[cite: 2].
3. **Immutability & Pure Functions**: Các hàm xử lý state (như tính toán gross/net rent, kiểm tra điều kiện build/upgrade) phải là pure functions, nhận vào state hiện tại và trả về bản sao state mới mà không làm thay đổi trực tiếp (mutate) object đầu vào[cite: 2].
4. **Data-driven Balance**: Mọi giá trị số học (chi phí xây dựng, rent theo level, hệ số operating cost 10%, xác suất event, trọng số tenant) phải được lấy từ typed configuration modules, không hardcode[cite: 1, 2].