const express = require('express');
const { db } = require('../services/db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

router.use(requireAdmin);

// 统计面板
router.get('/dashboard', (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) AS total_jobs FROM job', [], (err, row1) => {
    stats.total_jobs = row1 ? row1.total_jobs : 0;
    db.get(
      'SELECT COUNT(*) AS total_apps FROM application',
      [],
      (err2, row2) => {
        stats.total_apps = row2 ? row2.total_apps : 0;
        db.get(
          "SELECT COUNT(*) AS pending FROM application WHERE status = 'pending'",
          [],
          (err3, row3) => {
            stats.pending = row3 ? row3.pending : 0;
            db.get(
              "SELECT COUNT(*) AS approved FROM application WHERE status = 'approved'",
              [],
              (err4, row4) => {
                stats.approved = row4 ? row4.approved : 0;
                db.get(
                  "SELECT COUNT(*) AS rejected FROM application WHERE status = 'rejected'",
                  [],
                  (err5, row5) => {
                    stats.rejected = row5 ? row5.rejected : 0;
                    db.all(
                      `SELECT job.title, COUNT(application.id) AS count
                       FROM job
                       LEFT JOIN application ON job.id = application.job_id
                       GROUP BY job.id
                       ORDER BY count DESC`,
                      [],
                      (err6, jobStats) => {
                        if (err6)
                          return res.render('error', {
                            message: '加载统计失败'
                          });
                        res.render('admin/dashboard', {
                          stats,
                          jobStats
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// 投递审核列表
router.get('/applications', (req, res) => {
  db.all(
    `SELECT application.*, job.title, student_profile.name
     FROM application
     JOIN job ON application.job_id = job.id
     JOIN student_profile ON application.student_id = student_profile.id
     ORDER BY application.created_at DESC`,
    [],
    (err, applications) => {
      if (err)
        return res.render('error', { message: '加载投递记录失败' });
      res.render('admin/applications', { applications });
    }
  );
});

// 审核（通过 / 拒绝）
router.post('/applications/:id/review', (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.redirect('/admin/applications');
  }
  db.run(
    'UPDATE application SET status = ? WHERE id = ?',
    [status, id],
    (err) => {
      if (err)
        return res.render('error', { message: '更新状态失败' });
      res.redirect('/admin/applications');
    }
  );
});

// 岗位管理（控制 visible）
router.get('/jobs', (req, res) => {
  db.all(
    `SELECT job.*, company.company_name 
     FROM job
     JOIN company ON job.company_id = company.id
     ORDER BY job.created_at DESC`,
    [],
    (err, jobs) => {
      if (err) return res.render('error', { message: '加载岗位失败' });
      res.render('admin/jobs', { jobs });
    }
  );
});

router.post('/jobs/:id/visibility', (req, res) => {
  const id = req.params.id;
  const { visible } = req.body;
  const v = visible === '1' ? 1 : 0;
  db.run(
    'UPDATE job SET visible = ? WHERE id = ?',
    [v, id],
    (err) => {
      if (err)
        return res.render('error', { message: '更新岗位可见性失败' });
      res.redirect('/admin/jobs');
    }
  );
});

// 学生简历库
router.get('/students', (req, res) => {
  db.all(
    'SELECT student_profile.*, users.username FROM student_profile JOIN users ON student_profile.user_id = users.id',
    [],
    (err, students) => {
      if (err)
        return res.render('error', { message: '加载学生简历失败' });
      res.render('admin/students', { students });
    }
  );
});

// 账号管理
// 显示所有账号列表（除了自己）
router.get('/users', (req, res) => {
  const adminId = req.session.user.id;
  db.all(
    'SELECT id, username, role, created_at FROM users WHERE id != ? ORDER BY created_at DESC',
    [adminId],
    (err, users) => {
      if (err)
        return res.render('error', { message: '加载账号失败' });
      res.render('admin/users', { users, currentUserId: adminId });
    }
  );
});

// 显示创建账号表单
router.get('/users/new', (req, res) => {
  res.render('admin/users-form', { user: null, isEdit: false, error: null });
});

// 创建新账号
router.post('/users', (req, res) => {
  const { username, password, role } = req.body;
  if (!['student', 'company', 'admin'].includes(role)) {
    return res.render('admin/users-form', { 
      user: { username, role }, 
      isEdit: false,
      error: '角色选择错误' 
    });
  }
  if (!username || !password) {
    return res.render('admin/users-form', { 
      user: { username, role }, 
      isEdit: false,
      error: '用户名和密码不能为空' 
    });
  }
  
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hash, role],
    function (err) {
      if (err) {
        return res.render('admin/users-form', { 
          user: { username, role }, 
          isEdit: false,
          error: '用户名已存在或系统错误' 
        });
      }
      // 为学生和公司账号创建对应资料
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
      res.redirect('/admin/users');
    }
  );
});

// 显示编辑账号表单
router.get('/users/:id/edit', (req, res) => {
  const userId = req.params.id;
  const adminId = req.session.user.id;
  
  // 不能编辑自己
  if (parseInt(userId) === adminId) {
    return res.render('error', { message: '不能编辑自己的账号' });
  }
  
  db.get('SELECT id, username, role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user)
      return res.render('error', { message: '账号不存在' });
    res.render('admin/users-form', { user, isEdit: true, error: null });
  });
});

// 更新账号信息
router.post('/users/:id', (req, res) => {
  const userId = req.params.id;
  const adminId = req.session.user.id;
  const { username, role } = req.body;
  
  // 不能编辑自己
  if (parseInt(userId) === adminId) {
    return res.render('error', { message: '不能编辑自己的账号' });
  }
  
  if (!['student', 'company', 'admin'].includes(role)) {
    return res.render('error', { message: '角色选择错误' });
  }
  
  db.run(
    'UPDATE users SET username = ?, role = ? WHERE id = ?',
    [username, role, userId],
    (err) => {
      if (err)
        return res.render('error', { message: '更新账号失败' });
      res.redirect('/admin/users');
    }
  );
});

// 删除账号
router.post('/users/:id/delete', (req, res) => {
  const userId = req.params.id;
  const adminId = req.session.user.id;
  
  // 不能删除自己
  if (parseInt(userId) === adminId) {
    return res.render('error', { message: '不能删除自己的账号' });
  }
  
  // 获取用户信息以确定要删除的相关数据
  db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user)
      return res.render('error', { message: '账号不存在' });
    
    // 删除相关的个人资料数据
    if (user.role === 'student') {
      db.run('DELETE FROM student_profile WHERE user_id = ?', [userId]);
    } else if (user.role === 'company') {
      db.run('DELETE FROM company WHERE user_id = ?', [userId]);
    }
    
    // 删除用户账号
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
      if (err)
        return res.render('error', { message: '删除账号失败' });
      res.redirect('/admin/users');
    });
  });
});

module.exports = router;

