const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

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

// 1. 45 天健管日程計算 (GET /api/schedule)
router.get('/schedule', (req, res) => {
  const { startDate, prepMode, customPrepStartDate } = req.query;

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

// 2. 新增學員資料 (POST /api/students)
router.post('/students', async (req, res) => {
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
      custom_prep_start_date: customPrepStartDate || null
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, student: data[0] });
});

// 3. 新增/更新學員每週狀態 (POST /api/students/:id/weekly-log)
router.post('/students/:id/weekly-log', async (req, res) => {
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

// 4. 查詢學員及其所有週報 (GET /api/students/:id)
router.get('/students/:id', async (req, res) => {
  const { id } = req.params;

  const { data: student, error } = await supabase
    .from('students')
    .select('*, weekly_logs(*)')
    .eq('id', id)
    .single();

  if (error || !student) {
    return res.status(404).json({ error: '找不到該學員' });
  }

  res.json({ success: true, student });
});

module.exports = router;