# Skill: Idle Tycoon Economy & Time Engine
## Mục đích
Xây dựng hệ thống thời gian thực, tích lũy tiền thuê nhà liên tục và tính toán thu nhập offline chính xác, an toàn không bị exploit[cite: 1, 2, 4].

## Nguyên tắc cốt lõi:
1. **Quy đổi thời gian**: 1 Game Day = 1 giờ thực (3,600 giây). Tiền thuê nhà tích lũy liên tục theo phút/giây dựa trên công thức net income (gross trừ đi 10% operating cost cho phòng có người ở)[cite: 1, 2].
2. **Giới hạn Offline (8-hour cap)**: Thời gian offline tối đa được tính bằng công thức `offlineElapsed = min(max(now - lastCheckpointAt, 0), 8 hours)`[cite: 1, 2].
3. **Bảo toàn phần lẻ (Fractional Remainder)**: Phải lưu giữ số dư phần lẻ tiền thuê tích lũy qua các tick để tránh làm thất thoát tiền của người chơi do việc làm tròn liên tục[cite: 2].
4. **Atomic Checkpoint & Income**: Việc cộng tiền offline và cập nhật checkpoint thời gian phải được bọc trong **một IndexedDB atomic transaction duy nhất** để chống lỗi double-credit khi ứng dụng bị reload bất ngờ[cite: 4].