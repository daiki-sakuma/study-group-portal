const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// データベース設定
const db = new sqlite3.Database('./documents.db');

// データベース初期化
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    author TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles (id)
  )`);
});

// アップロードディレクトリ作成
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer設定（ファイルアップロード）
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // セキュアなファイル名生成
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const safeBasename = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = Date.now();
    cb(null, `${safeBasename}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB制限
  },
  fileFilter: function (req, file, cb) {
    // 許可するファイルタイプ
    const allowedTypes = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xlsx', '.xls', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です。PDF, Word, PowerPoint, Excel, テキストファイルのみアップロード可能です。'));
    }
  }
});

// ルート - アップロードフォーム
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 資料一覧ページ
app.get('/documents', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'documents.html'));
});

// ナレッジ共有ページ
app.get('/knowledge', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'knowledge.html'));
});

// 記事作成ページ
app.get('/knowledge/new', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'new-article.html'));
});

// 記事詳細ページ
app.get('/knowledge/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'article.html'));
});

// API - 資料一覧取得
app.get('/api/documents', (req, res) => {
  db.all('SELECT * FROM documents ORDER BY upload_date DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }
    res.json(rows);
  });
});

// API - 記事一覧取得
app.get('/api/articles', (req, res) => {
  db.all('SELECT * FROM articles ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }
    res.json(rows);
  });
});

// API - 記事詳細取得
app.get('/api/articles/:id', (req, res) => {
  const articleId = req.params.id;
  
  db.get('SELECT * FROM articles WHERE id = ?', [articleId], (err, row) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: '記事が見つかりません。' });
      return;
    }
    
    res.json(row);
  });
});

// API - 記事のコメント取得
app.get('/api/articles/:id/comments', (req, res) => {
  const articleId = req.params.id;
  
  db.all('SELECT * FROM comments WHERE article_id = ? ORDER BY created_at ASC', [articleId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }
    res.json(rows);
  });
});

// API - 記事作成
app.post('/api/articles', (req, res) => {
  const { title, content, author } = req.body;
  
  if (!title || !content || !author) {
    return res.status(400).json({ error: 'タイトル、内容、作成者は必須です。' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO articles (title, content, author)
    VALUES (?, ?, ?)
  `);
  
  stmt.run([title, content, author], function(err) {
    if (err) {
      res.status(500).json({ error: 'データベースへの保存に失敗しました。' });
      return;
    }
    
    res.json({ 
      message: '記事が正常に作成されました。',
      id: this.lastID 
    });
  });
});

// API - コメント作成
app.post('/api/articles/:id/comments', (req, res) => {
  const articleId = req.params.id;
  const { content, author } = req.body;
  
  if (!content || !author) {
    return res.status(400).json({ error: 'コメント内容と作成者は必須です。' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO comments (article_id, content, author)
    VALUES (?, ?, ?)
  `);
  
  stmt.run([articleId, content, author], function(err) {
    if (err) {
      res.status(500).json({ error: 'データベースへの保存に失敗しました。' });
      return;
    }
    
    res.json({ 
      message: 'コメントが正常に投稿されました。',
      id: this.lastID 
    });
  });
});

// API - ファイルアップロード
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'ファイルが選択されていません。' });
  }

  const { title, author } = req.body;

  if (!title || !author) {
    return res.status(400).json({ error: 'タイトルと作成者は必須です。' });
  }

  const stmt = db.prepare(`
    INSERT INTO documents (title, file_path, original_filename, author)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run([title, req.file.path, req.file.originalname, author], function(err) {
    if (err) {
      res.status(500).json({ error: 'データベースへの保存に失敗しました。' });
      return;
    }
    
    res.json({ 
      message: 'ファイルが正常にアップロードされました。',
      id: this.lastID 
    });
  });
});

// API - ファイルダウンロード
app.get('/api/download/:id', (req, res) => {
  const documentId = req.params.id;

  db.get('SELECT * FROM documents WHERE id = ?', [documentId], (err, row) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'ファイルが見つかりません。' });
      return;
    }

    const filePath = row.file_path;
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'ファイルが存在しません。' });
      return;
    }

    res.download(filePath, row.original_filename);
  });
});

// API - 文書削除
app.delete('/api/documents/:id', (req, res) => {
  const documentId = req.params.id;

  db.get('SELECT * FROM documents WHERE id = ?', [documentId], (err, row) => {
    if (err) {
      res.status(500).json({ error: 'データベースエラーが発生しました。' });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'ファイルが見つかりません。' });
      return;
    }

    // ファイル削除
    if (fs.existsSync(row.file_path)) {
      fs.unlinkSync(row.file_path);
    }

    // データベースから削除
    db.run('DELETE FROM documents WHERE id = ?', [documentId], (err) => {
      if (err) {
        res.status(500).json({ error: 'データベースからの削除に失敗しました。' });
        return;
      }
      
      res.json({ message: '文書が正常に削除されました。' });
    });
  });
});

// エラーハンドリング
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'ファイルサイズが大きすぎます（上限: 10MB）' });
    }
  }
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});