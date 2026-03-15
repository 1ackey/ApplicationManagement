const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../services/db');

const router = express.Router();

// 简历上传配置
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const unique = Date.now() + '_' + Math.round(Math.random() * 1e6);
    cb(null, safeBase + '_' + unique + ext);
  }
});
const upload = multer({ storage });

function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.redirect('/login');
  }
  next();
}

router.use(requireStudent);

// 岗位列表（只显示 visible=1）
router.get('/jobs', (req, res) => {
  db.all(
    `SELECT job.*, company.company_name 
     FROM job 
     JOIN company ON job.company_id = company.id
     WHERE job.visible = 1
     ORDER BY job.created_at DESC`,
    [],
    (err, jobs) => {
      if (err) return res.render('error', { message: '加载岗位失败' });
      res.render('student/jobs', { jobs });
    }
  );
});

// 岗位详情
router.get('/jobs/:id', (req, res) => {
  const id = req.params.id;
  const userId = req.session.user.id;
  db.get(
    `SELECT job.*, company.company_name 
     FROM job 
     JOIN company ON job.company_id = company.id
     WHERE job.id = ?`,
    [id],
    (err, job) => {
      if (err || !job) return res.render('error', { message: '岗位不存在' });
      // 获取学生简历状态
      db.get(
        'SELECT resume_url FROM student_profile WHERE user_id = ?',
        [userId],
        (errProfile, profile) => {
          const hasResume = profile && profile.resume_url;
          res.render('student/jobDetail', { job, hasResume });
        }
      );
    }
  );
});

// 投递岗位
router.post('/jobs/:id/apply', (req, res) => {
  const jobId = req.params.id;
  const userId = req.session.user.id;
  db.get(
    'SELECT id, resume_url FROM student_profile WHERE user_id = ?',
    [userId],
    (err, student) => {
      if (err || !student) {
        return res.render('error', { message: '学生信息不存在' });
      }
      // 检查是否已上传简历
      if (!student.resume_url) {
        return res.render('error', { message: '请先上传简历才能投递！' });
      }
      // 检查是否已对该岗位投递过
      db.get(
        'SELECT id FROM application WHERE job_id = ? AND student_id = ?',
        [jobId, student.id],
        (checkErr, existing) => {
          if (checkErr) {
            return res.render('error', { message: '系统错误，请稍后重试' });
          }
          if (existing) {
            return res.render('error', {
              message: '你已经投递过该岗位，无法重复投递'
            });
          }

          db.run(
            'INSERT INTO application (job_id, student_id, status) VALUES (?, ?, ?)',
            [jobId, student.id, 'pending'],
            (err2) => {
              if (err2) {
                return res.render('error', { message: '投递失败，请稍后重试' });
              }
              res.redirect('/student/applications');
            }
          );
        }
      );
    }
  );
});

// 投递记录
router.get('/applications', (req, res) => {
  const userId = req.session.user.id;
  db.get(
    'SELECT id FROM student_profile WHERE user_id = ?',
    [userId],
    (err, student) => {
      if (err || !student) {
        return res.render('error', { message: '学生信息不存在' });
      }
      db.all(
        `SELECT application.*, job.title 
         FROM application 
         JOIN job ON application.job_id = job.id
         WHERE application.student_id = ?
         ORDER BY application.created_at DESC`,
        [student.id],
        (err2, applications) => {
          if (err2)
            return res.render('error', { message: '加载投递记录失败' });
          res.render('student/applications', { applications });
        }
      );
    }
  );
});

// 个人信息（简单展示）
router.get('/profile', (req, res) => {
  const userId = req.session.user.id;
  db.get(
    `SELECT u.username, s.* 
     FROM users u 
     JOIN student_profile s ON u.id = s.user_id
     WHERE u.id = ?`,
    [userId],
    (err, profile) => {
      if (err || !profile)
        return res.render('error', { message: '加载个人信息失败' });
      res.render('student/profile', { profile });
    }
  );
});

// 上传简历文件
router.post(
  '/profile/resume',
  upload.single('resume_file'),
  (req, res) => {
    if (!req.file) {
      return res.render('error', { message: '请上传简历文件' });
    }
    const userId = req.session.user.id;
    const resumeUrl = '/uploads/' + req.file.filename;
    db.run(
      'UPDATE student_profile SET resume_url = ? WHERE user_id = ?',
      [resumeUrl, userId],
      (err) => {
        if (err) return res.render('error', { message: '保存简历失败' });
        res.redirect('/student/profile');
      }
    );
  }
);

module.exports = router;

