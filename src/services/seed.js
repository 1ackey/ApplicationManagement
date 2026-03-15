const bcrypt = require('bcryptjs');
const { db } = require('./db');

function ensureAdminSeed() {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['admin'],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve();

        const passwordHash = bcrypt.hashSync('admin123', 10);
        db.run(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          ['admin', passwordHash, 'admin'],
          (err2) => {
            if (err2) return reject(err2);
            console.log('已创建默认管理员账号：用户名 admin 密码 admin123');
            resolve();
          }
        );
      }
    );
  });
}

module.exports = { ensureAdminSeed };

