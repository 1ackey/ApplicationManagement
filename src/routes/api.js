const express = require('express');
const { db } = require('../services/db');

const router = express.Router();

// 简单 token 方式占位（真实环境应使用更安全认证）

// 学生 API
router.get('/jobs', (req, res) => {
  db.all(
    `SELECT job.id, job.title, job.description, job.requirement, job.visible, company.company_name
     FROM job
     JOIN company ON job.company_id = company.id
     WHERE job.visible = 1
     ORDER BY job.created_at DESC`,
    [],
    (err, jobs) => {
      if (err) return res.status(500).json({ error: '加载失败' });
      res.json(jobs);
    }
  );
});

router.get('/jobs/:id', (req, res) => {
  const id = req.params.id;
  db.get(
    `SELECT job.id, job.title, job.description, job.requirement, job.visible, company.company_name
     FROM job
     JOIN company ON job.company_id = company.id
     WHERE job.id = ?`,
    [id],
    (err, job) => {
      if (err || !job)
        return res.status(404).json({ error: '岗位不存在' });
      res.json(job);
    }
  );
});

// 其他 API 可根据需要进一步完善

module.exports = router;

