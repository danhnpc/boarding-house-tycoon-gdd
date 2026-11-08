# Kế hoạch: Camera view (kéo để di chuyển, chuột phải để xoay 3D)

- **Trạng thái:** Implemented trên `src/game/world/layout.ts` + `src/game/scenes/WorldScene.ts` (branch `camera-view`)
- **Tài liệu liên quan:** [ADR 0003](../decisions/0003-web-first-responsive-delivery.md), skill `isometric-world-rendering`

## 0. Quyết định đã chốt (8/11/2026)

1. **Yaw tự do 360°, không pitch.** "Nhìn từ dưới lòng đất" không xảy ra về cấu trúc vì tường extrude screen-up cố định bất kể yaw; phép xoay thực hiện trong screen space (isotropic), không phải grid-space (grid-space gây méo hình vì TILE_W ≠ TILE_H).
2. **Xoay qua phép chiếu screen-space** quanh `contentCenter`, depth tính từ screen-y của điểm ground đã xoay (depthFor với yaw → y'; yaw=0 identity đúng thành cũ).
3. **Tương lai production art:** yaw hợp lệ trong giai đoạn placeholder; khi production art (1 góc duy nhất) ra mắt, cần ADR riêng về 4 góc hoặc giới hạn vissza.command. Ghi chú bổ sung vào visual-direction nếu yaw giữ vĩnh viễn.
4. **Touch defer** sang giai đoạn release (open-item chuẩn ADR 0003).
5. Zoom: chưa làm. Nhớ góc nhìn: không nhớ.

## 1. Mục tiêu

Cho người chơi điều khiển góc nhìn của khu nhà trọ isometric:

1. **Chuột trái kéo** (drag): di chuyển khung hình lên, xuống, trái, phải (pan).
2. **Chuột phải kéo** (drag): xoay camera quanh trục đứng, kiểu 3D view (yaw).
3. Góc nhìn mặc định giữ nguyên như hiện tại, các thao tác chọn phòng và nâng cấp không đổi.

## 2. Phạm vi

### Trong phạm vi (giai đoạn này) — ✅ đã làm

- Pan bằng chuột trái kéo. ✅
- Yaw (xoay quanh trục đứng) bằng chuột phải kéo, screen-space isotropic. ✅
- Ngưỡng kéo (5 px, `DRAG_THRESHOLD_PX`) để phân biệt "kéo" với "click chọn phòng". ✅
- Chặn menu chuột phải của trình duyệt trên canvas. ✅
- Giữ trạng thái camera khi world được dựng lại (`rebuildRooms`), thay vì đưa về giữa mỗi lần. ✅
- Nút "Đặt lại góc nhìn" trên HUD (App giữ `GameHandle`, gọi `resetView()` trực tiếp). ✅
- Test thuần (Vitest): `tests/unit/layout-rotation.test.ts` — yaw=0 identity, 360° round-trip, convexity, depth theo từng góc. ✅
- E2E mới: test "camera:..." kéo trái không chọn, kéo phải đổi yaw, reset trả default, click sau reset vẫn chọn phòng. ✅

### Ngoài phạm vi (để sau, hoặc cần quyết định riêng)

- **Pitch** (nghiêng lên xuống): đổi toàn bộ phép chiếu isometric sang phép chiếu 3D thật. Công sức lớn hơn nhiều, không khuyến nghị cho MVP.
- **Zoom** bằng bánh xe chuột: có thể thêm, nhưng không nằm trong yêu cầu hiện tại.
- **Cử chỉ cảm ứng** (touch): ADR 0003 yêu cầu chạy trên điện thoại. Xem mục 7.
- **Lưu góc nhìn vào save**: góc nhìn là trạng thái trình bày (presentation), không phải trạng thái game. Không đưa vào `GameState`, không đổi `schemaVersion`.

## 3. Hiện trạng cần biết

- Phép chiếu nằm trong `layout.ts`:
  - `project(grid) = ((gridX - gridY) * TILE_W / 2, (gridX + gridY) * TILE_H / 2)`
  - `depthFor(grid) = gridX + gridY`
  - `TILE_W = 96`, `TILE_H = 48`, `WALL_H = 44`
- `roomSilhouette()` trả về đa giác lồi. `pointInConvexPolygon()` dùng để kiểm tra click.
- `WorldScene.rebuildRooms()` sắp `hitShapes` theo độ sâu giảm dần, và **gọi `centerCameraOnContent()` mỗi lần**. Vì vậy hiện tại mọi lần dựng lại đều reset camera.
- `onPointerDown` phát `ROOM_SELECTED` cho **mọi nút chuột** ngay khi nhấn. Cần đổi để chọn phòng chỉ khi nhả chuột và không kéo.
- Camera Phaser `setRotation` chỉ xoay mặt phẳng màn hình (spin 2D), **không** cho cảm giác 3D. Không dùng cách này.

## 4. Thiết kế

### 4.1 Trạng thái camera (trong WorldScene, không vào domain)

```ts
interface ViewState {
  panX: number;     // offset world, px
  panY: number;     // offset world, px
  yawRad: number;   // góc xoay quanh trục đứng, khởi tạo 0
}
```

Trạng thái này sống trong scene (hoặc một module presentation nhỏ), không đi qua `GameState`, không lưu IndexedDB.

### 4.2 Xoay (yaw) đi qua phép chiếu, không qua camera

- Thêm tham số `yawRad` (mặc định 0) vào `project()` và `depthFor()`, hoặc một hàm `rotateGrid(grid, yawRad, center)` gọi trước `project()`.
- Xoay quanh tâm nội dung (`contentCenter`) để khu nhà không trôi đi khi xoay.
- Với yaw = 0 kết quả phải đúng bằng hiện tại (đây là điều kiện để không vỡ test cũ).
- Đa giác phòng sau khi xoay vẫn lồi (phép xoay affine giữ tính lồi), nên `pointInConvexPolygon()` dùng lại được.

### 4.3 Sắp xếp độ sâu và thứ tự vẽ

- `depthFor` dùng tọa độ đã xoay. `hitShapes` và thứ tự vẽ phải sắp lại theo độ sâu mới khi yaw thay đổi.
- Tường và mặt bên có thể lộ ra khác đi khi xoay 90 độ. Cần kiểm tra trực quan ở 0, 90, 180, 270 độ.

### 4.4 Điều khiển chuột

| Thao tác | Hành vi |
|---|---|
| Chuột trái nhấn rồi kéo quá ngưỡng (khoảng 4–6 px) | Pan. Không phát `ROOM_SELECTED`. |
| Chuột trái nhấn rồi nhả, không vượt ngưỡng | Chọn phòng như cũ (phát khi `pointerup`). |
| Chuột phải kéo ngang | Yaw. Tốc độ tỉ lệ với quãng kéo. |
| Chuột phải nhấn | Không chọn phòng. |
| Menu chuột phải | Bị chặn trên canvas (`contextmenu` → `preventDefault`). |

- Giới hạn pan để khu nhà không trôi ra khỏi màn hình (clamp theo kích thước nội dung).
- Yaw không giới hạn 360 độ, hoặc giới hạn ±90 độ nếu thấy khó điều hướng. Quyết định ở mục 8.

### 4.5 Vòng đời

- Đăng ký và gỡ listener trong `create` và `shutdown`, như hiện tại.
- `rebuildRooms()` không gọi reset camera nữa. Chỉ `centerCameraOnContent()` lúc khởi tạo, và khi người chơi bấm reset view.
- Chuyển cảnh hoặc resize không làm mất `ViewState`.

## 5. Kế hoạch triển khai theo bước

1. **Tách ngưỡng kéo và sửa chọn phòng.** Chuyển việc phát `ROOM_SELECTED` sang `pointerup` và kiểm tra quãng kéo. Đây là thay đổi an toàn nhất, làm trước.
2. **Pan bằng chuột trái.** Thêm `panX/panY`, clamp, chặn `contextmenu`, giữ camera khi `rebuildRooms`.
3. **Hàm phép chiếu có yaw.** Thêm `yawRad` vào `layout.ts` với mặc định 0. Viết test thuần.
4. **Yaw bằng chuột phải.** Nối `ViewState.yawRad` vào `rebuildRooms` và sắp lại `hitShapes`.
5. **Nút reset view** trong HUD hoặc panel (cần React-Phaser bridge, xem skill `react-phaser-bridge`).
6. **Kiểm tra trực quan** ở nhiều góc và kiểm tra hover, chọn phòng khi đã xoay.

## 6. Kiểm thử

- **Vitest (thuần, không DOM):**
  - `project` và `depthFor` với yaw = 0 cho kết quả giống hệt bản cũ.
  - Xoay 360 độ trả về đúng điểm gốc (sai số nhỏ).
  - Đa giác phòng sau xoay vẫn lồi và `pointInConvexPolygon` đúng cho tâm phòng.
  - Thứ tự độ sâu đúng ở 0, 90, 180, 270 độ.
- **Playwright e2e:** các test hiện có (đặc biệt "2-4" và "1c", vốn click vào phòng ở góc nhìn mặc định) phải vẫn pass mà không đổi tọa độ click.
- **Thêm e2e mới:**
  - Kéo chuột trái làm thay đổi camera nhưng không chọn phòng.
  - Click ngắn (không kéo) vẫn chọn phòng.
  - Chuột phải kéo làm thay đổi yaw, không mở panel phòng.
- **Kiểm tra thủ công:** hover và chọn phòng sau khi xoay phải đúng với hình hiển thị.

## 7. Ước lượng công sức

| Hạng mục | Ước lượng |
|---|---|
| Pan bằng chuột trái, ngưỡng kéo, chặn menu chuột phải, giữ camera khi dựng lại | khoảng 1 ngày |
| Yaw bằng chuột phải, phép chiếu có yaw, sắp độ sâu, test | khoảng 1–2 ngày |
| Nút reset view và e2e mới | khoảng nửa ngày |
| Cử chỉ cảm ứng (một ngón pan, hai ngón xoay hoặc pinch) | thêm khoảng 1–2 ngày, cần thiết bị thật |
| Pitch (nghiêng) | lớn hơn nhiều, cần đổi phép chiếu; không ước lượng trong kế hoạch này |

Tổng cho chuột (không tính touch và pitch): khoảng 2–3 ngày làm việc.

## 8. Câu hỏi cần người dùng quyết định

1. **Xoay hay nghiêng?** Kế hoạch này làm xoay quanh trục đứng (yaw). Nếu muốn nghiêng lên xuống (pitch) thì phạm vi và công sức thay đổi lớn.
2. **Giới hạn góc xoay:** 360 độ tự do, hay giới hạn ±90 độ?
3. **Touch có làm trong giai đoạn này không?** ADR 0003 yêu cầu chạy trên điện thoại. Nếu có, cần thêm cử chỉ cảm ứng và kiểm tra trên thiết bị thật.
4. **Có cần zoom không?** Chưa có trong yêu cầu hiện tại.
5. **Góc nhìn có được nhớ giữa các lần mở game không?** Kế hoạch đề xuất **không** (trạng thái trình bày, không vào save). Nếu muốn nhớ thì lưu riêng trong `localStorage`, không đổi save.

## 9. Rủi ro

- **Hit test lệch sau khi xoay** nếu quên sắp lại `hitShapes`. Giảm rủi ro bằng test thuần ở mục 6.
- **Xung đột giữa kéo và chọn phòng** trên màn hình nhỏ. Ngưỡng kéo cần chỉnh qua thử nghiệm.
- **Thứ tự vẽ sai** ở một số góc xoay (tường che nhầm phòng). Cần kiểm tra trực quan.
- **Chuột phải trên trackpad** (Mac) khác với chuột thường. Cần ghi chú khi kiểm thử thủ công.
