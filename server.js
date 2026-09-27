import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 引入健管與學員路由（ES Modules 必須加上 .js 副檔名）
import healthRoutes from './routes/healthRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const sanitize = (str) => (str ? str.replace(/[^\x00-\x7F]/g, '').trim() : '');

const supabaseUrl = sanitize(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

// 根目錄測試
app.get('/', (req, res) => {
  res.json({ status: "API 運作正常" });
});

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

// 掛載健管與學員路由（將 /schedule, /students 等掛載至 /api 前綴下）
app.use('/api', healthRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器已在 http://localhost:${PORT} 啟動中`);
});