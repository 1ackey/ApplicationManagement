const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');

const { db } = require('./services/db');
const { ensureAdminSeed } = require('./services/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, '..', 'data')
    }),
    secret: 'internship-app-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }
  })
);

// 当前用户信息注入视图
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// 路由
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const companyRoutes = require('./routes/company');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/company', companyRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// 首页按角色跳转
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const role = req.session.user.role;
  if (role === 'student') return res.redirect('/student/jobs');
  if (role === 'company') return res.redirect('/company/jobs');
  if (role === 'admin') return res.redirect('/admin/dashboard');
  return res.redirect('/login');
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { message: '页面未找到' });
});

// 启动
ensureAdminSeed()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('启动失败:', err);
    process.exit(1);
  });

