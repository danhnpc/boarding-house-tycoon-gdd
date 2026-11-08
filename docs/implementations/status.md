# Trạng thái triển khai

- **Cập nhật lần cuối:** 2026-11-08
- **Nhánh chính:** `main` tại `bd0ab4d` (merge camera view). `origin/main` cùng commit.
- **Quy ước:** xem [README](README.md). Trạng thái: `Done`, `Partial`, `Not started`, `Blocked`.

## Bằng chứng gần nhất

| Kiểm thử | Kết quả | Ghi chú |
|---|---|---|
| Unit (Vitest) | 127/127 pass, 14 file | Chạy lại ngày 2026-11-08 trên `main` |
| E2E (Playwright, `tests/e2e/happy-path.spec.ts`) | 10/10 pass | Số liệu từ lần chạy trước. **Chưa chạy lại** sau camera view (`f998970`). Cần chạy lại trước khi coi là còn đúng. |
| Test "chạy trên code cũ phải fail" | Đã kiểm tra | Xác nhận các test mới fail trên code trước `bc1bef3`. |

## Phase theo Technical Architecture §15

Ghi chú: cột "Nhánh" là nhánh phase trong git, đều đã merge vào `main` (0 commit chưa merge). "Exit criteria" chỉ ghi **Done** khi có bằng chứng; các mục chưa kiểm chứng trên thiết bị thật để `Partial`.

| Phase | Nhánh (head) | Trạng thái | Bằng chứng | Còn mở |
|---|---|---|---|---|
| 0. Technical spike | `phase-0-spike` (`0c79e20`) | Partial | Scene Phaser + React, chọn phòng, panel phòng theo selection, E2E | Chưa kiểm tra trên Android Chrome và iOS Safari thật. Minimum browser version chưa định. |
| 1. Domain foundation | `phase-1-domain` (`f942753`) | Done | Domain test, save/load IndexedDB có `schemaVersion`, round-trip | Không có mục mở riêng ngoài các mục đã ghi ở phase sau. |
| 2. Vertical slice (2–4 phòng) | `phase-2-vertical-slice` (`999d481`) | Partial | Scene, HUD, panel phòng, offline catch-up (cap 8h), fix ở `ec52f3e`, `bc1bef3` | Xem bảng "Open items Phase 2" bên dưới. |
| 3. MVP management systems | `phase-3-mvp-systems` (`4b0388f`) | Partial | Phòng level 3, 6 phòng (`MAX_ROOMS=6`), 3 archetype, event, mission | Pacing gate chưa có kết luận. Copy mission/event/congrats chưa đủ. Save migration fixtures chưa đầy đủ. |
| 4. Mobile hardening | `phase-4-mobile-hardening` (`fde13d8`), `phase-4b-onboarding` (`5b5cb98`) | Partial | Onboarding, BootErrorScreen cho save hỏng/mới hơn, E2E save hỏng | Chưa test thiết bị thật. Chưa đo frame rate/memory. Error logging production chưa rõ. |

## Hạng mục ngoài phase

| Hạng mục | Trạng thái | Commit / nhánh | Ghi chú |
|---|---|---|---|
| Camera view (pan trái, yaw phải, reset) | Done | `f998970`, merge `bd0ab4d`, nhánh `camera-view` (đã merge) | Pan có ngưỡng kéo 5px. Yaw qua screen-space, không dùng `setRotation`. Không pitch, không zoom, không touch. Kế hoạch: [camera-view-plan](../planning/camera-view-plan.md). |
| Sửa High từ review toàn code | Done | `bc1bef3`, nhánh `fix/review-save-and-offline-integration` (đã merge) | Reset, lifecycle, progression, cost, tenant ID. |
| Sửa Medium/Low từ review | Not started | — | Danh sách issue nằm trong phiên review trước, chưa lập file. |
| Pacing simulation | Partial | `pacing-report.md` (chưa commit) | Sim có chạy. Kết quả "events spawned 1450" bất thường, **chưa điều tra**. Chưa có quyết định pacing gate. |
| Touch input (cử chỉ cảm ứng) | Not started | — | ADR 0003 yêu cầu. Camera plan đã defer sang giai đoạn release. |
| Nội dung tiếng Việt | Partial | `src/locales/vi.json` (~88 key có giá trị) | Tech doc §15 ghi "file có key rỗng, chưa có copy". **Mâu thuẫn**: file thực tế đã có giá trị. Cần cập nhật tech doc. |
| Asset manifest | Partial | `src/config/assets.ts` | Tất cả đánh dấu `placeholder: true`. Tech doc ghi 12 key, số dòng hiện tại khác. Cần đối chiếu lại. |
| PWA manifest | Done | `public/manifest.webmanifest` | Có file. Chưa kiểm tra cài đặt trên thiết bị. |

## Open items (lấy từ tech doc §15, trạng thái đã kiểm)

| Mục | Owner (theo tài liệu) | Trạng thái |
|---|---|---|
| Copy tiếng Việt HUD, panel, mission card, onboarding | Product owner | Partial (đã có ~88 key, cần rà soát) |
| Tên tenant tiếng Việt | Product owner | Blocked (chưa có danh sách) |
| Layout phòng cho 2 và 4 phòng | Art lead (chưa gán) | Not started |
| Asset manifest | — | Partial (placeholder) |
| Chính sách placeholder art | — | Done (GDD mục 10) |
| Browser tối thiểu, test Android Chrome và iOS Safari | — | Not started |
| Pacing simulation và quyết định gate | Chưa gán | Partial |
| Copy 5 event MVP | Product owner | Not started (chưa xác nhận) |
| Copy 7 mission và màn hình chúc mừng | Product owner | Not started (chưa xác nhận) |
| Phòng level 3 và layout 6 phòng | Art lead | Not started |
| Expression tenant (9 biến thể) | — | Not started (placeholder chấp nhận được) |
| Illustration event | — | Not started (placeholder chấp nhận được) |
| SFX (~8 + nút tắt tiếng) | — | Not started. Chưa quyết định Phase 3 hay 4. |
| Save migration fixtures cho Phase 2–3 | — | Partial |

## Việc cần làm tiếp theo (do người quyết định)

1. Chạy lại Playwright sau camera view để cập nhật số liệu E2E.
2. Điều tra số event 1450 trong pacing sim trước khi quyết định gate.
3. Đồng bộ tech doc §15 với thực tế (vi copy, số key asset).
4. Chưa commit `pacing-report.md`. Giữ nguyên cho đến khi có quyết định.
