# Boarding House Tycoon — Câu hỏi cần chốt trước khi implement

- **Trạng thái:** Giữ nguyên làm lịch sử câu hỏi, không sửa khi chốt. Quyết định hiện hành nằm trong [GDD](game-design-plan.md) (mục 5, 6, 7, 8, 9, 10, 12) và [tech doc 9.2](../planning/technical-architecture.md).
- **Ngày:** 7 tháng 11 năm 2026
- **Liên quan:** [GDD MVP](game-design-plan.md), [Technical Architecture](../planning/technical-architecture.md), [Visual Direction](../art/visual-direction.md)

## Cách dùng

Mỗi câu hỏi có ba phần: vấn đề, các lựa chọn, và đề xuất mặc định. Nếu không có quyết định khác, có thể implement theo đề xuất mặc định và ghi lại vào GDD. Khi đã chốt, cập nhật GDD trước, rồi mới sửa code, theo quy tắc trong [docs/README.md](../README.md).

Mức ưu tiên:
- **P0:** chặn việc implement. Phải chốt trước Phase 1 hoặc Phase 2 (vertical slice).
- **P1:** cần trước Phase 3 (hệ thống event, mission, offline đầy đủ).
- **P2:** cần trước khi phát hành.

---

## A. Luật gameplay

### A1. Phòng có Student không nâng được lên Level 2 (P0)
- **Vấn đề:** Student có ngân sách 150, Level 2 có rent 210. Mục 4.3 của GDD chặn nâng cấp khi ngân sách tenant nhỏ hơn rent mới. Mục 5.4 ghi rõ "The MVP has no tenant-removal action", nên không có cách nào đưa phòng về Vacant. Một phòng đã có Student sẽ kẹt ở Level 1 mãi mãi.
- **Lựa chọn:**
  1. Thêm hành động "Chuyển tenant ra" để phòng thành Vacant (không tốn tiền hoặc tốn phí cố định).
  2. Bỏ điều kiện ngân sách khi nâng cấp, để tenant hiện tại tiếp tục ở với rent mới.
  3. Giữ nguyên, chấp nhận phòng kẹt.
- **Đề xuất mặc định:** 1. Chuyển tenant ra miễn phí, phòng về Vacant và candidate mới được sinh ra theo luật bình thường.
- **Cần quyết định:** phí chuyển tenant ra có không, và có cần xác nhận không.

### A2. Cơ chế sinh candidate (P0)
- **Vấn đề:** Mục 5.3 ghi "One candidate check every 5 minutes of active online play" nhưng không nói check có luôn thêm candidate không, hay có xác suất. Cũng không nói có dừng khi hàng chờ đầy không. Mục 6.2 có xác suất 25% cho event, nhưng không có xác suất tương tự cho candidate.
- **Lựa chọn:**
  1. Mỗi check luôn thêm 1 candidate nếu hàng chờ dưới 3 và có ít nhất một phòng Vacant.
  2. Mỗi check có xác suất p (cần đặt con số), sau đó mới thêm candidate.
- **Đề xuất mặc định:** 1. Hàng chờ đầy sẽ dừng việc sinh thêm. Với 5 phút mỗi check, có thể đầy hàng chờ sau khoảng 15 phút chơi.
- **Cần quyết định:** có chấp nhận đề xuất này không, hay cần xác suất p.

### A3. Eligibility của candidate: xác nhận lại (P0)
- **Vấn đề:** Mục 5.2 đã định nghĩa "A candidate is eligible when Maximum Budget >= Room Rent". Điều chưa rõ là candidate có cần một phòng Vacant cụ thể để đối chiếu, và rent nào được dùng khi so sánh (rent Level hiện tại hay Level tối đa của phòng đó).
- **Đề xuất mặc định:** So với rent Level hiện tại của phòng Vacant. Nếu không có phòng Vacant nào, không sinh candidate.
- **Lưu ý:** với luật này, Office Worker luôn đủ điều kiện nếu có phòng trống (380 ≥ 350). Student và Messy chỉ đủ điều kiện cho phòng Level 1.

### A4. Trọng số khi chọn event (P1)
- **Vấn đề:** Mục 6.3 bước 4 nói "Select one eligible event" nhưng không nói chọn theo cách nào.
- **Đề xuất mặc định:** Chọn đều giữa các event đủ điều kiện.

### A5. Hệ số "Messy Tenant tăng eligibility weight" (P1)
- **Vấn đề:** Mục 6.4 ghi Messy Tenant tăng trọng số của event Hallway clutter, nhưng không có con số.
- **Đề xuất mặc định:** Khi có ít nhất một Messy Tenant đang ở, trọng số của Hallway clutter nhân 2 so với event khác.
- **Cần quyết định:** hệ số nhân là bao nhiêu.

### A6. Lựa chọn "Warn for free" của Hallway clutter (P1)
- **Vấn đề:** Mục 6.4 ghi "Warn for free; clear current issue" nhưng "clear current issue" không có tác dụng cụ thể, vì Warn không tốn tiền.
- **Đề xuất mặc định:** Không có tác dụng gì: event đóng, không có penalty, không có cooldown ngoài cooldown chung.

### A7. Noise complaint và "same-tenant cooldown" (P1)
- **Vấn đề:** Mục 6.4 không nói event nhắm vào tenant nào. Không nói "same-tenant cooldown" là bao lâu.
- **Đề xuất mặc định:** Chọn ngẫu nhiên đều một tenant đang ở. Tenant đó không bị nhắm lại trong 30 phút online (cùng với per-event cooldown).
- **Lựa chọn Hire mediator (80 Cash):** theo GDD, chặn event Noise cho tenant đó trong 60 phút online. Cần xác nhận tenant nào là "tenant đó".

### A8. Group of students cần hai Student (P1)
- **Vấn đề:** Mục 6.4 ghi "Accept; fill both with Student tenants" nhưng không có nguồn sinh ra hai Student.
- **Lựa chọn:**
  1. Tạo trực tiếp hai tenant Student vào hai phòng Level 1 đang Vacant, không đi qua hàng chờ.
  2. Đặt hai candidate Student vào hàng chờ, bỏ qua giới hạn 3.
- **Đề xuất mặc định:** 1. Tạo trực tiếp.

### A9. Event hỏng nước: giảm 15% trên gross hay net? (P1)
- **Vấn đề:** Mục 6.4 ghi Delay 1 Game Day giảm 15% gross rent của tất cả phòng đang ở. Mục 3.2 có chi phí vận hành 10% gross. Chưa rõ 15% có tính trước khi trừ 10% chi phí hay không.
- **Đề xuất mặc định:** Giảm 15% trên gross rent, sau đó vẫn trừ 10% chi phí vận hành như bình thường.

---

## B. Thời gian và offline (P0)

### B1. Định nghĩa "active online time"
- **Vấn đề:** GDD dùng "online" và "active" nhưng không định nghĩa. Không rõ app ở nền có được tính không, hay chỉ tính khi app hiển thị trên màn hình.
- **Đề xuất mặc định:** Chỉ tính thời gian app đang hiển thị ở foreground. Khi app ở nền thì đồng hồ online dừng lại.

### B2. Modifier tạm thời khi offline
- **Vấn đề:** GDD mục 8.2 yêu cầu tích hợp modifier đang hoạt động trong thời gian offline. Công thức ở tech doc mục 9.2 không có modifier.
- **Đề xuất mặc định:** Theo GDD. Cập nhật công thức ở tech doc mục 9.2 để tích hợp modifier theo thời gian còn lại.

### B3. Giới hạn 8 giờ "per interval"
- **Vấn đề:** GDD nói "cap 8 hours per interval" nhưng không rõ "interval" là gì.
- **Đề xuất mặc định:** Một interval là khoảng thời gian từ lúc app đóng đến lúc mở lại. Phần vượt quá 8 giờ bị mất, không cộng dồn.

### B4. Cooldown khi offline
- **Vấn đề:** GDD mục 8.1 nói cooldown của event và candidate chỉ đếm khi online. Modifier tạm thời thì vẫn đếm khi offline. Cần xác nhận đây là hai luật khác nhau.
- **Đề xuất mặc định:** Xác nhận như vậy.

---

## C. Nội dung và trải nghiệm (P1)

### C1. Ngôn ngữ
- **Vấn đề:** Bối cảnh là nhà trọ Việt Nam và tên dự án gốc là tiếng Việt, nhưng GDD viết tiếng Anh. Chưa có quyết định về ngôn ngữ UI.
- **Lựa chọn:**
  1. Tiếng Việt là ngôn ngữ chính, tiếng Anh để sau.
  2. Tiếng Anh là ngôn ngữ chính, tiếng Việt để sau.
  3. Song ngữ ngay từ MVP.
- **Đề xuất mặc định:** 1. Thiết kế chuỗi text qua file riêng (key và giá trị), để sau dễ thêm ngôn ngữ.

### C2. Text UI, tên tenant, mô tả event
- **Vấn đề:** Chưa có nội dung nào. Acceptance criteria yêu cầu người chơi hiểu mục tiêu, nên cần text thật.
- **Cần quyết định:** ai viết, và có cần duyệt không. Tên tenant có cần là tên người Việt không.

### C3. Onboarding
- **Vấn đề:** Chưa có luồng hướng dẫn. Tiêu chí 1 ở mục 12 yêu cầu người chơi hiểu mục tiêu và mission kế tiếp.
- **Đề xuất mặc định:** Hướng dẫn 4 bước: nhận rent → chấp nhận candidate đầu tiên → mở Room Detail → nâng cấp hoặc xây phòng khi đủ tiền. Dùng overlay có text ngắn.

### C4. Âm thanh
- **Vấn đề:** Tech doc chỉ nhắc nhóm asset âm thanh. GDD không có danh sách.
- **Đề xuất mặc định:** Khoảng 8 SFX cho các thao tác (nhận tiền, xây, nâng cấp, accept, reject, event, mission hoàn thành, lỗi). Không có nhạc nền trong vertical slice. Có nút bật tắt âm thanh.

### C5. Kết thúc MVP
- **Vấn đề:** Mục 7.2 định nghĩa "MVP completion" nhưng không có gì xảy ra sau đó.
- **Lựa chọn:**
  1. Màn hình chúc mừng, sau đó người chơi tiếp tục chơi tự do.
  2. Kết thúc hẳn, không cho chơi tiếp.
- **Đề xuất mặc định:** 1.

### C6. Ý nghĩa "develop all 6 rooms"
- **Vấn đề:** Mục 7.2 nói "develop all 6 rooms" nhưng không rõ là xây đủ 6 phòng hay nâng cấp đủ 6 phòng lên Level 3.
- **Đề xuất mặc định:** Xây đủ 6 phòng và hoàn thành 7 mission. Mission 7 chỉ yêu cầu nâng một phòng lên Level 3.

### C7. Settings
- **Vấn đề:** Tech doc có nhắc settings chung. GDD không nói gì.
- **Đề xuất mặc định:** Có các mục: bật tắt âm thanh, ngôn ngữ (khi có nhiều ngôn ngữ), reset save có hộp xác nhận. Không có thông báo đẩy.

---

## D. Phát hành (P2)

### D1. Nền tảng
- **Đề xuất mặc định:** Android trước, qua Capacitor. iOS để sau trừ khi có yêu cầu.
- **Cần quyết định:** phiên bản Android tối thiểu, và có cần iOS trong MVP không.

### D2. Chính sách quyền riêng tư
- **Đề xuất mặc định:** Không có analytics, không có tài khoản, dữ liệu chỉ lưu trên máy. Chính sách rất ngắn, nêu rõ điều này.

### D3. Crash log
- **Đề xuất mặc định:** Không có SDK ngoài. Ghi lỗi cục bộ để debug.

### D4. Icon, splash, store listing
- **Cần quyết định:** tên hiển thị trên store, icon, mô tả ngắn, ảnh chụp màn hình, độ tuổi.

### D5. Reset và sao lưu save
- **Vấn đề:** [ADR 0002](../decisions/0002-local-first-save.md) ghi rằng xóa dữ liệu trình duyệt hoặc app sẽ mất save, nếu không có tính năng xuất hoặc sao lưu.
- **Đề xuất mặc định:** Không có sao lưu trong MVP. Cảnh báo người chơi ở phần settings khi reset.

---

## E. Nghệ thuật (P1)

### E1. Số biểu cảm cho mỗi tenant
- **Vấn đề:** Checklist ở [visual-direction.md](../art/visual-direction.md) mục 12 ghi "idle + compact expression variants" nhưng không có số lượng.
- **Cần quyết định:** mỗi tenant có bao nhiêu biểu cảm (đề xuất: 3).

### E2. Bố cục phòng cho 2, 4 và 6 phòng
- **Vấn đề:** Checklist ghi "fixed room layout for 2, 4, and 6 room progression states" nhưng chưa có bản vẽ hoặc mô tả.
- **Cần quyết định:** ai thiết kế bố cục, và có cần duyệt trước khi làm asset không.

### E3. Ảnh concept và asset sản xuất
- **Đề xuất mặc định:** Ảnh trong `docs/art/assets/` chỉ là tham khảo. Asset sản xuất làm mới, theo quy tắc đặt tên trong visual-direction.

### E4. Asset manifest
- **Vấn đề:** Chưa có danh sách key của asset để Phaser load.
- **Đề xuất mặc định:** Tạo một file manifest trong quá trình Phase 2, không cần chốt bây giờ.

---

## F. Dữ liệu cân bằng (P1)

### F1. Mục tiêu playtest
- **Vấn đề:** Mục 12 nêu các thước đo cần theo dõi nhưng không có mục tiêu số.
- **Đề xuất mặc định:** Đặt mục tiêu sau khi có mô phỏng đầu tiên. Cần một mô phỏng pacing để biết MVP kéo dài bao lâu (xem phần pacing trong câu trả lời trước).

---

## Tóm tắt quyết định cần có trước Phase 1

- **P0 (trước Phase 1–2):** A1, A2, A3, B1, B2, B3.
- **P1 (trước Phase 3):** A4–A9, C1–C7, E1–E2, F1.
- **P2 (trước phát hành):** D1–D5.

Các câu P0 cần chốt trước khi viết domain và vertical slice. Nếu chưa có quyết định, có thể dùng đề xuất mặc định ở mỗi mục và ghi lại vào GDD.
