import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer'; // ✅ ES Modules 語法引入 Multer

// 引入健管與學員路由（ES Modules 必須加上 .js 副檔名）
import healthRoutes from './routes/healthRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// 設定照片暫存於記憶體，方便直接推送到 Supabase Storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 限制單張照片 5MB
});

const app = express();
app.use(cors());
app.use(express.json());

// 靜態檔案託管：自動將 public/index.html 作為首頁渲染
app.use(express.static('public'));

const sanitize = (str) => (str ? str.replace(/[^\x00-\x7F]/g, '').trim() : '');

const supabaseUrl = sanitize(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

// JWT Bearer Token 驗證 Middleware (確保教練已登入)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供授權 Token' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ success: false, error: 'Token 驗證失敗或已過期' });
  }

  req.user = user;
  next();
};

// 舊的 Todos 測試路由
app.get('/api/todos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, is_complete, created_at');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 📌 新增：學員歷史備註與照片上傳 API 區塊
// ==========================================

// 1. 取得指定學員的歷史備註 (越早紀錄由上而下排序)
app.get('/api/students/:studentId/notes', verifyToken, async (req, res) => {
  const { studentId } = req.params;

  try {
    const { data, error } = await supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', studentId)
      .order('record_date', { ascending: true }) // 優先按日期由早到晚排序
      .order('created_at', { ascending: true }); // 同日期的按建立時間排序

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, notes: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. 新增／單週編輯備註 (支援最多 5 張照片上傳至 Supabase Storage)
app.post('/api/students/:studentId/notes', verifyToken, upload.array('photos', 5), async (req, res) => {
  const { studentId } = req.params;
  const { noteId, recordDate, weekNumber, content } = req.body;
  const coachId = req.user.id; // 從驗證成功的教練 JWT 取得 User ID

  try {
    let photoUrls = [];

    // 若有上傳新照片，寫入 Supabase Storage
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // 建立防撞檔名的公開儲存路徑：教練ID/學員ID/時間戳記_檔名
        const fileName = `${coachId}/${studentId}/${Date.now()}_${file.originalname}`;
        
        const { error: uploadError } = await supabase.storage
          .from('student-photos')
          .upload(fileName, file.buffer, { contentType: file.mimetype });

        if (uploadError) {
          console.error('圖片上傳至 Supabase Storage 失敗:', uploadError.message);
          continue;
        }

        // 取得圖片的 Public URL 網址
        const { data: publicUrlData } = supabase.storage
          .from('student-photos')
          .getPublicUrl(fileName);

        photoUrls.push(publicUrlData.publicUrl);
      }
    }

    let result;

    if (noteId && noteId.trim() !== '') {
      // 情況 A：單週編輯既有紀錄
      const updateData = {
        record_date: recordDate,
        week_number: weekNumber,
        content: content,
        updated_at: new Date()
      };

      // 只有當上傳了新照片時才更新照片欄位
      if (photoUrls.length > 0) {
        updateData.photo_urls = photoUrls;
      }

      result = await supabase
        .from('student_notes')
        .update(updateData)
        .eq('id', noteId)
        .eq('coach_id', coachId) // 保障教練資料隔離
        .select();
    } else {
      // 情況 B：新增一筆紀錄
      result = await supabase
        .from('student_notes')
        .insert([{
          student_id: studentId,
          coach_id: coachId,
          record_date: recordDate,
          week_number: weekNumber,
          content: content,
          photo_urls: photoUrls
        }])
        .select();
    }

    if (result.error) throw result.error;

    res.json({ success: true, note: result.data[0] });
  } catch (err) {
    console.error('儲存備註失敗:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 掛載健管與學員路由（將 /schedule, /students 等掛載至 /api 前綴下）
app.use('/api', healthRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器已在 http://localhost:${PORT} 啟動中`);
});