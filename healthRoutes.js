const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * 1. 新增學員資料
 * POST /api/students
 */
router.post('/students', async (req, res) => {
  const { name, height, startDate, prepMode, customPrepStartDate } = req.body;

  if (!name || !startDate) {
    return res.status(400).json({ error: '姓名與開始執行日期為必填！' });
  }

  const { data, error } = await supabase
    .from('students')
    .insert([
      {
        name,
        height,
        start_date: startDate,
        prep_mode: prepMode || 'default',
        custom_prep_start_date: customPrepStartDate || null
      }
    ])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, student: data[0] });
});

/**
 * 2. 新增或更新學員的「每週數值照片與備註」
 * POST /api/students/:id/weekly-log
 */
router.post('/students/:id/weekly-log', async (req, res) => {
  const { id } = req.params;
  const { weekNumber, photoUrl, note } = req.body;

  if (!weekNumber) {
    return res.status(400).json({ error: '請提供週數 (weekNumber)' });
  }

  const { data, error } = await supabase
    .from('weekly_logs')
    .insert([
      {
        student_id: id,
        week_number: weekNumber,
        photo_url: photoUrl,
        note: note
      }
    ])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, log: data[0] });
});

/**
 * 3. 取得特定學員的完整資料與所有週報紀錄
 * GET /api/students/:id
 */
router.get('/students/:id', async (req, res) => {
  const { id } = req.params;

  // 聯表查詢：抓取學員資料並同時撈出該學員的所有 weekly_logs
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