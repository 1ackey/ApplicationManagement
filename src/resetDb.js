const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.sqlite');
const sessionsDbPath = path.join(dataDir, 'sessions.sqlite');

console.log('开始重置数据库...');

// 删除现有的数据库文件
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('✓ 已删除应用数据库');
}

if (fs.existsSync(sessionsDbPath)) {
  fs.unlinkSync(sessionsDbPath);
  console.log('✓ 已删除会话数据库');
}

// 删除uploads目录中的所有文件
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  files.forEach(file => {
    const filePath = path.join(uploadsDir, file);
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  });
  if (files.length > 0) {
    console.log(`✓ 已删除 ${files.length} 个上传文件`);
  }
}

// 创建新的数据库连接
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'company', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) console.error('创建users表出错:', err);
    else console.log('✓ 已创建users表');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS student_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      school TEXT,
      major TEXT,
      resume_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.error('创建student_profile表出错:', err);
    else console.log('✓ 已创建student_profile表');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_name TEXT,
      description TEXT,
      contact_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.error('创建company表出错:', err);
    else console.log('✓ 已创建company表');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS job (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      requirement TEXT,
      visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES company(id)
    );
  `, (err) => {
    if (err) console.error('创建job表出错:', err);
    else console.log('✓ 已创建job表');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS application (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES job(id),
      FOREIGN KEY (student_id) REFERENCES student_profile(id)
    );
  `, (err) => {
    if (err) console.error('创建application表出错:', err);
    else console.log('✓ 已创建application表');

    // 所有表都创建后，创建admin账户
    createAdminUser();
  });
});

function createAdminUser() {
  const passwordHash = bcrypt.hashSync('admin123', 10);
  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    ['admin', passwordHash, 'admin'],
    (err) => {
      if (err) {
        console.error('✗ 创建admin账户失败:', err);
      } else {
        console.log('\n✓ 数据库重置完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('已创建默认管理员账号');
        console.log('用户名: admin');
        console.log('密码: admin123');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      db.close();
    }
  );
}
