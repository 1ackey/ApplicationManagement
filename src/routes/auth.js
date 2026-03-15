const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../services/db');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) return res.render('auth/login', { error: '系统错误' });
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.render('auth/login', { error: '用户名或密码错误' });
      }
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };
      res.redirect('/');
    }
  );
});

router.get('/register', (req, res) => {
  res.render('auth/register', { error: null });
});

router.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!['student', 'company'].includes(role)) {
    return res.render('auth/register', { error: '角色选择错误' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hash, role],
    function (err) {
      if (err) {
        return res.render('auth/register', { error: '用户名已存在或系统错误' });
      }
      // 创建角色对应资料
      if (role === 'student') {
        db.run(
          'INSERT INTO student_profile (user_id, name) VALUES (?, ?)',
          [this.lastID, username]
        );
      } else if (role === 'company') {
        db.run(
          'INSERT INTO company (user_id, company_name) VALUES (?, ?)',
          [this.lastID, username]
        );
      }
      res.redirect('/login');
    }
  );
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;

