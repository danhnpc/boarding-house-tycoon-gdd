# Skill: React & Phaser Bridge Architecture
## Mục đích
Quản lý vòng đời đồng bộ và giao tiếp mượt mà giữa DOM (React UI) và Canvas (Phaser Game World) mà không gây rò rỉ bộ nhớ (memory leak) hoặc khởi động trùng lặp game instance[cite: 2, 3].

## Nguyên tắc cốt lõi:
1. **Phân rã trách nhiệm rõ ràng**:
   - **React**: Sở hữu conventional UI (HUD, room details, candidate panel, event dialogs, missions)[cite: 2].
   - **Phaser**: Sở hữu thế giới isometric 2D, sprites, camera, touch hit-areas, và visual state animations[cite: 2, 3].
2. **Lifecycle Safety**: Khởi động instance Phaser một lần duy nhất bằng `useRef` / `useLayoutEffect`, và bắt buộc gọi `game.destroy(true)` khi React component unmount để tránh tạo duplicate canvas[cite: 2, 3].
3. **Typed Bridge Contract**: Giao tiếp giữa React và Phaser bắt buộc thông qua một Typed Event Bus hoặc Zustand store dùng chung. Tuyệt đối không truyền ngược class instance phức tạp hoặc gọi trực tiếp DOM elements từ Phaser code[cite: 2].
4. **Không đưa per-frame state vào React**: Không bao giờ đẩy tọa độ vị trí theo từng khung hình (per-frame coordinates) của Phaser vào React state để tránh gây re-render vô ích cho DOM[cite: 2].