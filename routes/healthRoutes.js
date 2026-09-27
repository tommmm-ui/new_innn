import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const sanitize = (str) => (str ? str.replace(/[^\x00-\x7F]/g, '').trim() : '');
const supabaseUrl = sanitize(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY);
const supabase = createClient(supabaseUrl, supabaseKey);

// 45 天正式日順序陣列
const OFFICIAL_45_DAYS = [
  '準備日', '準備日', '準備日',
  '蛋白日', '蛋白日', '蛋白日',
  '纖體日', '纖體日', '纖體日', '纖體日', '蛋白日',
  '纖體日', '纖體日', '纖體日', '纖體日', '纖體日', '纖體日', '蛋白日',
  '纖體日', '纖體日', '纖體日', '纖體日', '纖體日', '纖體日', '蛋白日',
  '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日', '蛋白日',
  '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日', '新陳代謝日',
  '蛋白日', '纖體日', '纖體日', '纖體日', '新陳代謝日', '新陳代謝日'
];

function parseDateOnly(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * 🔒 教練權限驗證中間件 (Middleware)
 * 檢查請求 Header 是否帶有有效的 Bearer Token (Supabase Access Token)
 */
async function authenticateCoach(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供驗證 Token，請先登入教練帳號' });
  }

  const token = authHeader.split(' ')[1];

  // 向 Supabase 驗證 Token 是否為有效登入用戶
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Token 無效或已過期，請重新登入' });
  }

  // 將驗證通過的教練資訊附帶在 req 物件上
  req.coach = user;
  next();
}

// ------------------------------------------------------------------
// 1. 公開 Endpoint：45 天健管日程查詢 (需輸入密碼 168168)
// ------------------------------------------------------------------
router.get('/schedule', (req, res) => {
  const { startDate, prepMode, customPrepStartDate, password } = req.query;

  // 驗證密碼
  if (password !== '168168') {
    return res.status(401).json({ error: '密碼錯誤或未輸入密碼，無法查詢日程' });
  }

  if (!startDate) {
    return res.status(400).json({ error: '請輸入開始執行日期（備註：開始日為數值表第一週的日期）' });
  }

  if (prepMode === 'delay' && !customPrepStartDate) {
    return res.status(400).json({ error: '選擇「延後準備日」時，必須輸入「開始準備日日期」' });
  }

  let day1Date;
  if (prepMode === 'delay') {
    day1Date = parseDateOnly(customPrepStartDate);
  } else {
    const baseDate = parseDateOnly(startDate);
    baseDate.setDate(baseDate.getDate() + 1);
    day1Date = baseDate;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = [];

  for (let i = 0; i < 6; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);

    const diffTime = targetDate - day1Date;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const currentPlanDay = diffDays + 1;

    let dayType = '';
    let weekNumber = 0;
    let arrayIndex = currentPlanDay - 1;

    if (prepMode === 'skip') {
      arrayIndex += 3;
    }

    if (currentPlanDay < 1) {
      dayType = '尚未開始（前置準備期）';
      weekNumber = 0;
    } else if (arrayIndex >= OFFICIAL_45_DAYS.length) {
      dayType = '45天健管計畫已完結';
      weekNumber = 7;
    } else {
      dayType = OFFICIAL_45_DAYS[arrayIndex];
      weekNumber = Math.ceil(currentPlanDay / 7);
    }

    const formattedDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    result.push({
      date: formattedDate,
      isToday: i === 0,
      planDay: currentPlanDay > 0 && arrayIndex < OFFICIAL_45_DAYS.length ? `第 ${currentPlanDay} 天` : '非執行期間',
      week: weekNumber > 0 && weekNumber <= 7 ? `第 ${weekNumber} 週` : '非執行期間',
      dayType: dayType
    });
  }

  res.json({ success: true, schedule: result });
});

// ------------------------------------------------------------------
// 2. 🔒 私密 Endpoint：僅限登入教練存取與管理學員資料
// ------------------------------------------------------------------

// 2-1. 查詢該教練的所有學員列表 (GET /api/students)
router.get('/students', authenticateCoach, async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*, weekly_logs(*)')
    .eq('coach_id', req.coach.id) // 僅抓取該教練自己的學員
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, students: data });
});

// 2-2. 新增學員資料 (POST /api/students)
router.post('/students', authenticateCoach, async (req, res) => {
  const { name, height, startDate, prepMode, customPrepStartDate } = req.body;

  if (!name || !startDate) {
    return res.status(400).json({ error: '姓名與開始執行日期為必填！' });
  }

  const { data, error } = await supabase
    .from('students')
    .insert([{
      name,
      height,
      start_date: startDate,
      prep_mode: prepMode || 'default',
      custom_prep_start_date: customPrepStartDate || null,
      coach_id: req.coach.id // 自動帶入目前登入教練的 ID
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, student: data[0] });
});

// 2-3. 新增/更新學員每週狀態 (POST /api/students/:id/weekly-log)
router.post('/students/:id/weekly-log', authenticateCoach, async (req, res) => {
  const { id } = req.params;
  const { weekNumber, photoUrl, note } = req.body;

  if (!weekNumber) {
    return res.status(400).json({ error: '請提供週數 (weekNumber)' });
  }

  const { data, error } = await supabase
    .from('weekly_logs')
    .insert([{
      student_id: id,
      week_number: weekNumber,
      photo_url: photoUrl,
      note: note
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, log: data[0] });
});

// 2-4. 查詢單一學員詳細資料及其週報 (GET /api/students/:id)
router.get('/students/:id', authenticateCoach, async (req, res) => {
  const { id } = req.params;

  const { data: student, error } = await supabase
    .from('students')
    .select('*, weekly_logs(*)')
    .eq('id', id)
    .single();

  if (error || !student) {
    return res.status(404).json({ error: '找不到該學員' });
  }

  // 檢查是否為該教練的學員
  if (student.coach_id && student.coach_id !== req.coach.id) {
    return res.status(403).json({ error: '權限不足，您無法查看其他教練的學員資料' });
  }

  res.json({ success: true, student });
});

export default router;