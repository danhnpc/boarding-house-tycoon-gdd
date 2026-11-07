# Skill: Isometric World & Rendering Management
## Mục đích
Hướng dẫn agent cách thiết lập khung cảnh isometric, xử lý độ sâu (depth sorting) và tương tác chạm trên mobile cho các sprite trong Phaser[cite: 2].

## Nguyên tắc cốt lõi:
1. **Depth Sorting (Độ sâu)**: Luôn thiết lập `depth` của sprite dựa trên tọa độ chân tiếp đất (ground anchor coordinate) thay vì tọa độ góc trên bên trái (`top-left`) của ảnh để nhân vật/đồ vật che khuất nhau đúng quy tắc isometric[cite: 2].
2. **State-driven Rendering**: Trạng thái hiển thị của phòng (Trống/Đang thuê, Level 1/2/3, sự cố hỏng hóc) phải được dẫn xuất hoàn toàn từ domain state. Phaser Scene chỉ nhận state mới và cập nhật texture/animation tương ứng[cite: 2].
3. **Không dùng Physics cho MVP**: MVP không yêu cầu pathfinding phức tạp hay hệ thống vật lý va chạm cho tenant, tập trung vào visual container và touch hit areas đơn giản, tối ưu hiệu năng mobile[cite: 2].