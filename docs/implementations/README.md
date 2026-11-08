# Implementations

Folder này ghi lại **đã làm tới đâu** trong code, so với kế hoạch trong [Technical Architecture §15](../planning/technical-architecture.md#15-implementation-plan).

Các tài liệu khác trong `docs/` mô tả *cần làm gì và vì sao*. Folder này mô tả *đã làm gì, đang dở gì, kiểm chứng bằng gì*.

## File trong folder

| File | Nội dung |
|---|---|
| [`status.md`](status.md) | Trạng thái từng phase và từng hạng mục, commit/branch tương ứng, bằng chứng kiểm thử, việc còn mở |

## Quy ước cập nhật

1. Khi một hạng mục được merge vào `main`, cập nhật `status.md` trong **cùng** PR/commit với code.
2. Trạng thái chỉ dùng 4 giá trị:
   - `Done`: đã code, đã có test hoặc đã kiểm chứng thủ công, đã merge.
   - `Partial`: có một phần, phần còn lại ghi rõ trong cột "Còn mở".
   - `Not started`: chưa bắt đầu.
   - `Blocked`: cần quyết định hoặc tài nguyên từ người khác (ghi ai là người cần).
3. Mỗi dòng phải có bằng chứng: commit hash, tên branch, số test, hoặc đường dẫn file. Không ghi `Done` nếu không chỉ ra được bằng chứng.
4. Không xoá dòng cũ. Nếu một hạng mục bị làm lại hoặc đổi hướng, ghi thêm dòng mới và ghi chú lý do.
5. Số liệu (số test, số e2e) ghi theo lần chạy gần nhất, kèm ngày.
6. Quyết định về nội dung game vẫn thuộc GDD; folder này không đổi luật chơi.

## Cách kiểm tra nhanh

```bash
git log --oneline main
npx vitest run
npx playwright test
```
