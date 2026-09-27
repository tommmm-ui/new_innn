const { createClient } = require('@supabase/supabase-js')

// 自動相容不同的環境變數命名
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function fetchTodos() {
  console.log('正在連線至 Supabase 讀取資料庫...')
  const { data, error } = await supabase.from('todos').select('*')

  if (error) {
    console.error('❌ 連線或讀取失敗：', error)
  } else {
    console.log('🎉 成功連線！抓取到的資料如下：')
    console.dir(data, { depth: null })
  }
}

fetchTodos()