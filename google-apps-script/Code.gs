/**
 * ============================================================================
 * GOOGLE APPS SCRIPT — ĐỒNG BỘ FORM ĐĂNG KÝ WORKSHOP (PRODUCTION GRADE)
 * Workshop: GIEO VIẾT "NGÁCH" – GẶT VIỆC "PHỤ"
 * 
 * Spreadsheet ID : 1e60PYBqSVqKvtCoTzoVpP3U5b7nNhR-3sXedfQuyI4k
 * Sheet Name     : Leads
 *
 * HƯỚNG DẪN TRIỂN KHAI NHANH:
 * 1. Mở Google Sheet (ID trên), chọn: Extensions (Tiện ích mở rộng) → Apps Script.
 * 2. Dán toàn bộ mã nguồn này vào tệp Code.gs và nhấn Ctrl+S (Cmd+S) để lưu.
 * 3. Tại thanh công cụ chọn hàm `setupSheet` rồi bấm "Run" (Chạy) để cấp quyền truy cập.
 * 4. Nhấn "Deploy" (Triển khai) → "New deployment" (Triển khai mới):
 *    - Select type: Web app
 *    - Description: Production v2.0
 *    - Execute as: Me (Tài khoản của bạn)
 *    - Who has access: Anyone (Bất kỳ ai)
 * 5. Nhấn "Deploy" và sao chép đường link Web App URL gắn vào index.html.
 * ============================================================================
 */

const SPREADSHEET_ID = '1e60PYBqSVqKvtCoTzoVpP3U5b7nNhR-3sXedfQuyI4k';
const SHEET_NAME = 'Leads';

// Cấu hình ghi nhận thời gian đăng ký (Múi giờ Việt Nam GMT+7)
// Nếu đặt true hoặc Sheet có cột thứ 7, hệ thống sẽ tự động ghi thời gian vào cột G
const AUTO_RECORD_TIMESTAMP = true;

// Tiêu đề 6 cột chuẩn
const BASE_HEADERS = [
  'Họ và tên',
  'Email',
  'Số điện thoại / Zalo',
  'Lĩnh vực chuyên môn',
  'Bạn mong muốn nhận được điều gì sau workshop?',
  'Câu hỏi bạn mong muốn diễn giả giải đáp'
];

const TIMESTAMP_HEADER = 'Thời gian đăng ký';

/**
 * Regex kiểm tra số điện thoại di động Việt Nam hợp lệ.
 * Hỗ trợ các đầu số: 03, 05, 07, 08, 09 (10 chữ số).
 */
const VN_PHONE_REGEX = /^(?:(?:\+84|84)0?|0)(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;

/**
 * Regex kiểm tra định dạng email hợp lệ chuẩn RFC.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/**
 * Hàm khởi tạo hoặc kiểm tra cấu trúc trang tính Leads.
 * Chạy hàm này lần đầu tiên trong Apps Script để cấp quyền.
 */
function setupSheet() {
  const sheet = getOrCreateLeadsSheet_();
  Logger.log('==================================================');
  Logger.log('Kết nối thành công đến bảng tính: ' + sheet.getName());
  Logger.log('Tổng số dòng hiện có: ' + sheet.getLastRow());
  Logger.log('Tổng số cột hiện có: ' + sheet.getLastColumn());
  Logger.log('==================================================');
}

/**
 * Hàm chạy thử nghiệm gửi dữ liệu mẫu (dùng để test trong Apps Script editor).
 */
function testSubmit() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        fullName: 'Nguyễn Văn Test',
        email: 'test.lead@gmail.com',
        phone: '0901234567',
        profession: 'Content Marketing Specialist',
        expectation: 'Tìm hiểu cách xây kênh và đóng gói sản phẩm dịch vụ từ chuyên môn.',
        question: 'Làm sao để tiếp cận đúng tệp khách hàng tiềm năng?',
        website_hp: ''
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log('Kết quả test doPost: ' + response.getContent());
}

/**
 * Endpoint kiểm tra trạng thái hoạt động Web App (Healthcheck).
 */
function doGet() {
  try {
    const sheet = getOrCreateLeadsSheet_();
    return jsonResponse_({
      status: 'ok',
      sheet: SHEET_NAME,
      rowCount: sheet.getLastRow(),
      message: 'Google Apps Script Web App đang hoạt động bình thường.',
      timestamp: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss')
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Không thể kết nối đến Google Sheet: ' + (err && err.message ? err.message : String(err))
    });
  }
}

/**
 * Endpoint nhận dữ liệu POST từ form đăng ký Landing Page.
 * Hỗ trợ CORS tự nhiên qua text/plain JSON payload.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    // Đợi tối đa 10 giây nếu nhiều người submit cùng lúc để chống xung đột race-condition
    lock.waitLock(10000);

    const data = parseRequestPayload_(e);

    // 1. Chống Spam / Bot qua trường Honeypot ẩn (website_hp)
    if (data.website_hp && String(data.website_hp).trim().length > 0) {
      Logger.log('[Spam Rejected] Bot filled honeypot field: ' + data.website_hp);
      // Trả success giả để bot không thử lại
      return jsonResponse_({ status: 'success', message: 'Đăng ký thành công.' });
    }

    // 2. Làm sạch và chuẩn hóa dữ liệu đầu vào
    const fullName = sanitizeForSheet_(data.fullName);
    const email = cleanText_(data.email).toLowerCase();
    const rawPhone = cleanText_(data.phone);
    const normalizedPhone = normalizeVnPhone_(rawPhone);
    const profession = sanitizeForSheet_(data.profession);
    const expectation = sanitizeForSheet_(data.expectation);
    const question = sanitizeForSheet_(data.question);

    // 3. Kiểm tra các trường bắt buộc
    if (!fullName || !email || !normalizedPhone || !profession || !expectation) {
      return jsonResponse_({
        status: 'error',
        message: 'Vui lòng điền đầy đủ tất cả các thông tin bắt buộc.'
      });
    }

    // 4. Backend Validation: Email
    if (!EMAIL_REGEX.test(email)) {
      return jsonResponse_({
        status: 'error',
        message: 'Địa chỉ email không đúng định dạng.'
      });
    }

    // 5. Backend Validation: Số điện thoại di động Việt Nam
    if (!VN_PHONE_REGEX.test(normalizedPhone)) {
      return jsonResponse_({
        status: 'error',
        message: 'Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (10 chữ số).'
      });
    }

    // 6. Ghi dữ liệu vào Google Sheet
    const sheet = getOrCreateLeadsSheet_();
    const nextRow = Math.max(sheet.getLastRow() + 1, 2);

    // Xác định có ghi thêm cột thời gian hay không (tự động nhận diện cấu trúc Sheet)
    const currentCols = sheet.getLastColumn();
    const hasTimestampCol = AUTO_RECORD_TIMESTAMP || currentCols >= 7;

    const rowValues = [
      fullName,
      email,
      normalizedPhone,
      profession,
      expectation,
      question
    ];

    if (hasTimestampCol) {
      const vnTime = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
      rowValues.push(vnTime);
    }

    const targetRange = sheet.getRange(nextRow, 1, 1, rowValues.length);

    // Ép kiểu Plain Text ('@') để đảm bảo không mất số 0 đầu và không chạy công thức lạ
    targetRange.setNumberFormat('@');
    targetRange.setValues([rowValues]);

    // Ép đồng bộ lập tức lên máy chủ Google
    SpreadsheetApp.flush();

    Logger.log('[Lead Added] ' + fullName + ' | ' + email + ' | ' + normalizedPhone + ' | Dòng: ' + nextRow);

    return jsonResponse_({
      status: 'success',
      row: nextRow,
      message: 'Đăng ký thành công.'
    });

  } catch (err) {
    Logger.log('[Error doPost] ' + (err && err.message ? err.message : String(err)));
    return jsonResponse_({
      status: 'error',
      message: err && err.message ? err.message : 'Lỗi hệ thống khi ghi nhận đăng ký.'
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

/**
 * Lấy hoặc tạo trang tính Leads với tiêu đề chuẩn.
 */
function getOrCreateLeadsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Nếu trang tính đang hoàn toàn trống, tự động tạo dòng header
  if (sheet.getLastRow() === 0) {
    const headers = AUTO_RECORD_TIMESTAMP
      ? BASE_HEADERS.concat([TIMESTAMP_HEADER])
      : BASE_HEADERS.slice();

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#122922');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    // Cột số điện thoại (Cột C) luôn định dạng plain text
    sheet.getRange('C:C').setNumberFormat('@');
  }

  return sheet;
}

/**
 * Đọc payload từ text/plain JSON hoặc URL parameter.
 */
function parseRequestPayload_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {}
  }

  return e.parameter || {};
}

/**
 * Chuẩn hóa số điện thoại di động Việt Nam về dạng 0xxxxxxxxx (10 chữ số).
 * Xử lý các tiền tố +84, 84, khoảng trắng, dấu chấm, gạch nối.
 */
function normalizeVnPhone_(phoneStr) {
  if (!phoneStr) return '';
  let cleaned = String(phoneStr).replace(/[\s.\-()]/g, '');

  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }

  return cleaned;
}

/**
 * Làm sạch chuỗi văn bản thông thường.
 */
function cleanText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Chống Formula Injection cho Google Sheets (nếu chuỗi bắt đầu bằng =, +, -, @).
 */
function sanitizeForSheet_(value) {
  const cleaned = cleanText_(value);
  if (!cleaned) return '';

  // Nếu ký tự đầu là dấu công thức, thêm dấu nháy đơn để Google Sheets hiểu là chuỗi thuần
  const firstChar = cleaned.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
    return "'" + cleaned;
  }

  return cleaned;
}

/**
 * Trả phản hồi JSON chuẩn.
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
