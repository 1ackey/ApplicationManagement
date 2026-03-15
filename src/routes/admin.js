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

module.exports = router;

