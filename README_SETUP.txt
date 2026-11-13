TUANANH SHOP — HƯỚNG DẪN CÀI ĐẶT

1) Tạo tài khoản/project miễn phí tại https://supabase.com/
2) Tạo project mới. Trong Project Settings > API, lấy:
   - Project URL
   - anon/public (hoặc publishable) key
3) Mở index.html bằng trình soạn thảo. Tìm hai dòng:
   const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
   Thay bằng URL và public key của project. KHÔNG dùng service_role key.
4) Trong Supabase > SQL Editor, dán toàn bộ file supabase_schema.sql và chạy.
5) Mở website, tạo tài khoản bằng email của bạn. Nếu Supabase yêu cầu xác nhận email, hãy xác nhận.
6) Trong Supabase > Authentication > Users, sao chép UUID tài khoản của bạn.
   Cuối file SQL có câu lệnh mẫu. Thay UUID_TAI_KHOAN_CUA_BAN bằng UUID thật rồi chạy:
   update public.profiles set role = 'admin' where id = 'UUID_THAT';
   Từ đó tài khoản đó có quyền Admin. Không cấp quyền admin cho người khác tùy tiện.
7) Đưa index.html lên GitHub repository (ví dụ repository tên tuananhshop), bật
   Settings > Pages > Deploy from a branch > main > /(root).
   Địa chỉ thường là https://TEN_GITHUB_CUA_BAN.github.io/tuananhshop/
   Nếu muốn https://TEN_GITHUB_CUA_BAN.github.io/ thì repository phải tên TEN_GITHUB_CUA_BAN.github.io.

CHỨC NĂNG ĐÃ CÓ TRONG MẪU
- Khách: đăng ký/đăng nhập, đặt dịch vụ, xem đơn hàng của mình.
- Admin: thêm/sửa/ẩn dịch vụ, xem đơn của khách và cập nhật trạng thái.
- Supabase Auth + Postgres + Row Level Security.

LƯU Ý
- File chạy ở chế độ xem thử nếu chưa cấu hình Supabase; tài khoản/đơn hàng sẽ chưa hoạt động.
- Bảo mật quyền Admin được kiểm tra ở database bằng RLS, không dựa vào việc ẩn nút trên giao diện.
- Không gửi mật khẩu Roblox, OTP, cookie hay thông tin đăng nhập Roblox cho shop.
- Đây là trang dịch vụ độc lập, không liên kết hoặc được Roblox bảo trợ.
- Link Messenger/Zalo hiện là link mẫu; thay bằng link chính thức của shop khi có.
