/**
 * GOOGLE APPS SCRIPT — ĐỒNG BỘ FORM ĐĂNG KÝ WORKSHOP
 * Workshop: GIEO VIẾT "NGÁCH" – GẶT VIỆC "PHỤ"
 *
 * Spreadsheet ID : 1e60PYBqSVqKvtCoTzoVpP3U5b7nNhR-3sXedfQuyI4k
 * Tên trang tính : Leads
 */

const SPREADSHEET_ID = '1e60PYBqSVqKvtCoTzoVpP3U5b7nNhR-3sXedfQuyI4k';
const SHEET_NAME = 'Leads';

// Đổi thành true nếu muốn tự động ghi thêm cột G ("Thời gian đăng ký")
const INCLUDE_TIMESTAMP_COL = false;

const HEADERS = [
  'Họ và tên',
  'Email',
  'Số điện thoại / Zalo',
  'Lĩnh vực chuyên môn',
  'Bạn mong muốn nhận được điều gì sau workshop?',
  'Câu hỏi bạn mong muốn diễn giả giải đáp'
];

/**
 * Chạy hàm này 1 lần đầu trong trình soạn thảo Apps Script (Chọn `setupSheet` -> nhấn Run)
 * để cấp quyền truy cập Google Sheet và khởi tạo tiêu đề cột nếu trang tính đang trống.
 */
function setupSheet() {
  const sheet = getOrCreateLeadsSheet_();
  Logger.log('Kết nối thành công tới trang tính: ' + sheet.getName() + ' (Số dòng hiện tại: ' + sheet.getLastRow() + ')');
}

/**
 * Endpoint kiểm tra trạng thái hoạt động khi mở Web App URL trên trình duyệt.
 */
function doGet() {
  return jsonResponse_({
    status: 'ok',
    sheet: SHEET_NAME,
    message: 'Google Apps Script Web App đang hoạt động bình thường.'
  });
}

/**
 * Endpoint nhận dữ liệu POST từ form đăng ký trên Landing Page (index.html).
 * Sử dụng Content-Type: text/plain;charset=utf-8 để tương thích CORS hoàn toàn với trình duyệt.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    // Đợi tối đa 10 giây nếu có nhiều người bấm đăng ký cùng thời điểm
    lock.waitLock(10000);

    const data = parseRequestPayload_(e);

    const fullName = cleanText_(data.fullName);
    const email = cleanText_(data.email).toLowerCase();
    const phone = cleanText_(data.phone);
    const profession = cleanText_(data.profession);
    const expectation = cleanText_(data.expectation);
    const question = cleanText_(data.question);

    // Kiểm tra các trường bắt buộc
    if (!fullName || !email || !phone || !profession || !expectation) {
      return jsonResponse_({
        status: 'error',
        message: 'Vui lòng điền đầy đủ các thông tin bắt buộc.'
      });
    }

    const sheet = getOrCreateLeadsSheet_();
    const nextRow = Math.max(sheet.getLastRow() + 1, 2);

    const rowValues = [
      fullName,
      email,
      phone,
      profession,
      expectation,
      question
    ];

    if (INCLUDE_TIMESTAMP_COL) {
      const vnTime = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
      rowValues.push(vnTime);
    }

    const targetRange = sheet.getRange(nextRow, 1, 1, rowValues.length);

    // Định dạng Plain Text ('@') trước khi ghi để:
    // 1. Giữ nguyên số 0 ở đầu số điện thoại (VD: 0888115716)
    // 2. Chống lỗi #ERROR! hoặc công thức khi nhập +84... / dấu =, +, -
    targetRange.setNumberFormat('@');
    targetRange.setValues([rowValues]);

    SpreadsheetApp.flush();

    return jsonResponse_({
      status: 'success',
      row: nextRow
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: err && err.message ? err.message : 'Lỗi máy chủ Google Apps Script.'
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

/**
 * Mở bảng tính theo ID, lấy trang tính `Leads` (hoặc tạo mới nếu chưa có),
 * và tự động khởi tạo dòng tiêu đề nếu trang tính đang hoàn toàn trống.
 */
function getOrCreateLeadsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    const headers = INCLUDE_TIMESTAMP_COL
      ? HEADERS.concat(['Thời gian đăng ký'])
      : HEADERS.slice();

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);

    // Đảm bảo toàn bộ cột C (Số điện thoại / Zalo) luôn ở định dạng văn bản thuần
    sheet.getRange('C:C').setNumberFormat('@');
  }

  return sheet;
}

/**
 * Hỗ trợ đọc cả JSON gửi qua text/plain lẫn dữ liệu form-urlencoded.
 */
function parseRequestPayload_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {
      // Nếu không phải chuỗi JSON thì chuyển sang đọc e.parameter bên dưới
    }
  }

  return e.parameter || {};
}

/**
 * Chuẩn hóa chuỗi văn bản đầu vào.
 */
function cleanText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Trả phản hồi JSON chuẩn cho trình duyệt.
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
