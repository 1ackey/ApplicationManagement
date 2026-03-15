const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { db } = require('../services/db');

const router = express.Router();

function requireCompany(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'company') {
    return res.redirect('/login');
  }
  next();
}

router.use(requireCompany);

// 企业岗位列表
router.get('/jobs', (req, res) => {
  const userId = req.session.user.id;
  db.get(
    'SELECT id FROM company WHERE user_id = ?',
    [userId],
    (err, company) => {
      if (err || !company) {
        return res.render('error', { message: '企业信息不存在' });
      }
      db.all(
        'SELECT * FROM job WHERE company_id = ? ORDER BY created_at DESC',
        [company.id],
        (err2, jobs) => {
          if (err2)
            return res.render('error', { message: '加载岗位失败' });
          res.render('company/jobs', { jobs });
        }
      );
    }
  );
});

// 发布岗位页面
router.get('/jobs/new', (req, res) => {
  res.render('company/jobForm', { job: null, error: null });
});

// 发布岗位
router.post('/jobs', (req, res) => {
  const { title, description, requirement } = req.body;
  const userId = req.session.user.id;
  db.get(
    'SELECT id FROM company WHERE user_id = ?',
    [userId],
    (err, company) => {
      if (err || !company) {
        return res.render('error', { message: '企业信息不存在' });
      }
      db.run(
        'INSERT INTO job (company_id, title, description, requirement, visible) VALUES (?, ?, ?, ?, 1)',
        [company.id, title, description, requirement],
        (err2) => {
          if (err2)
            return res.render('company/jobForm', {
              job: null,
              error: '发布失败'
            });
          res.redirect('/company/jobs');
        }
      );
    }
  );
});

// 编辑岗位页面
router.get('/jobs/:id/edit', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM job WHERE id = ?', [id], (err, job) => {
    if (err || !job) return res.render('error', { message: '岗位不存在' });
    res.render('company/jobForm', { job, error: null });
  });
});

// 更新岗位
router.post('/jobs/:id', (req, res) => {
  const id = req.params.id;
  const { title, description, requirement } = req.body;
  db.run(
    'UPDATE job SET title = ?, description = ?, requirement = ? WHERE id = ?',
    [title, description, requirement, id],
    (err) => {
      if (err)
        return res.render('company/jobForm', {
          job: { id, title, description, requirement },
          error: '保存失败'
        });
      res.redirect('/company/jobs');
    }
  );
});

// 查看投递学生列表
router.get('/applications', (req, res) => {
  const userId = req.session.user.id;
  db.get(
    'SELECT id FROM company WHERE user_id = ?',
    [userId],
    (err, company) => {
      if (err || !company) {
        return res.render('error', { message: '企业信息不存在' });
      }
      db.all(
        `SELECT application.*, job.id as job_id, job.title, student_profile.name, student_profile.resume_url
         FROM application
         JOIN job ON application.job_id = job.id
         JOIN student_profile ON application.student_id = student_profile.id
         WHERE job.company_id = ? AND application.status = 'approved'
         ORDER BY job.id, application.created_at DESC`,
        [company.id],
        (err2, applications) => {
          if (err2)
            return res.render('error', { message: '加载投递失败' });
          // 按岗位分组
          const groupedByJob = {};
          applications.forEach(app => {
            if (!groupedByJob[app.job_id]) {
              groupedByJob[app.job_id] = {
                job_id: app.job_id,
                title: app.title,
                applications: []
              };
            }
            groupedByJob[app.job_id].applications.push(app);
          });
          const jobGroups = Object.values(groupedByJob);
          res.render('company/applications', { applications, jobGroups });
        }
      );
    }
  );
});

// 删除岗位
router.post('/jobs/:id/delete', (req, res) => {
  const jobId = req.params.id;
  const userId = req.session.user.id;
  // 先检查这个岗位是否属于当前用户
  db.get(
    `SELECT job.id FROM job
     JOIN company ON job.company_id = company.id
     WHERE job.id = ? AND company.user_id = ?`,
    [jobId, userId],
    (err, job) => {
      if (err || !job) {
        return res.render('error', { message: '岗位不存在或无权限删除' });
      }
      // 删除相关的应用记录先（可选，取决于业务逻辑）
      db.run('DELETE FROM application WHERE job_id = ?', [jobId], (delErr) => {
        if (delErr) {
          return res.render('error', { message: '删除失败' });
        }
        // 再删除岗位
        db.run('DELETE FROM job WHERE id = ?', [jobId], (delErr2) => {
          if (delErr2) {
            return res.render('error', { message: '删除岗位失败' });
          }
          res.redirect('/company/jobs');
        });
      });
    }
  );
});

// 下载指定岗位的所有简历
router.get('/jobs/:id/download-resumes', (req, res) => {
  const jobId = req.params.id;
  const userId = req.session.user.id;
  db.get(
    `SELECT job.title FROM job
     JOIN company ON job.company_id = company.id
     WHERE job.id = ? AND company.user_id = ?`,
    [jobId, userId],
    (err, job) => {
      if (err || !job) {
        return res.render('error', { message: '岗位不存在或无权限' });
      }
      // 获取该岗位的所有通过审核的投递及简历URL
      db.all(
        `SELECT student_profile.name, student_profile.resume_url
         FROM application
         JOIN student_profile ON application.student_id = student_profile.id
         WHERE application.job_id = ? AND application.status = 'approved' AND student_profile.resume_url IS NOT NULL`,
        [jobId],
        (err2, rows) => {
          if (err2 || !rows || rows.length === 0) {
            return res.render('error', { message: '没有简历可下载' });
          }
          // 创建ZIP文件
          const archive = archiver('zip', { zlib: { level: 9 } });
          const jobDate = new Date().toISOString().split('T')[0];
          const zipName = `${job.title}_简历_${jobDate}.zip`;
          res.attachment(zipName);
          archive.pipe(res);
          // 添加文件到ZIP
          rows.forEach((row) => {
            if (row.resume_url) {
              const filePath = path.join(__dirname, '..', '..', row.resume_url);
              if (fs.existsSync(filePath)) {
                const fileName = path.basename(filePath);
                const namePrefix = row.name ? `${row.name}_` : '';
                archive.file(filePath, { name: `${namePrefix}${fileName}` });
              }
            }
          });
          archive.on('error', (err) => {
            res.status(500).render('error', { message: '生成压缩包失败' });
          });
          archive.finalize();
        }
      );
    }
  );
});

module.exports = router;

