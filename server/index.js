const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing from server/.env');
}

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'applytrack',
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions'
  }
});

app.use(session({
  name: 'applytrack.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Welcome route and database health check


function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Please log in to continue'
    });
  }

  next();
}

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== 'string' ||
      !email.trim() ||
      email.trim().length > 255 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        error: 'Enter a valid name and email, and a password of 8–72 characters'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Please enter a valid email address'
      });
    }

    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), normalizedEmail, passwordHash]
    );

    // Log the new user in with a fresh session.
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error('Session creation error:', sessionError.message);
        return res.status(500).json({
          error: 'Account created, but login failed. Please log in.'
        });
      }

      req.session.userId = result.insertId;

      req.session.save((saveError) => {
        if (saveError) {
          console.error('Session save error:', saveError.message);
          return res.status(500).json({
            error: 'Account created, but login failed. Please log in.'
          });
        }

        res.status(201).json({
          message: 'Account created successfully',
          user: {
            id: result.insertId,
            name: name.trim(),
            email: normalizedEmail
          }
        });
      });
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'An account with this email already exists'
      });
    }

    console.error('Registration error:', error.message);
    res.status(500).json({
      error: 'Failed to create account'
    });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password ||
      password.length > 72
    ) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.execute(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (
      users.length === 0 ||
      !(await bcrypt.compare(password, users[0].password_hash))
    ) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const user = users[0];

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error('Session regeneration error:', sessionError.message);
        return res.status(500).json({
          error: 'Login failed. Please try again.'
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error('Session save error:', saveError.message);
          return res.status(500).json({
            error: 'Login failed. Please try again.'
          });
        }

        res.json({
          message: 'Login successful',
          user: {
            id: user.id,
            name: user.name,
            email: user.email
          }
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      error: 'Failed to log in'
    });
  }
});

// CURRENT USER
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, name, email FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (users.length === 0) {
      return req.session.destroy(() => {
        res.status(401).json({ error: 'Please log in again' });
      });
    }

    res.json({ user: users[0] });
  } catch (error) {
    console.error('Current user error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve user'
    });
  }
});

// LOGOUT
app.post('/api/auth/logout', requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout error:', error.message);
      return res.status(500).json({
        error: 'Failed to log out'
      });
    }

    res.clearCookie('applytrack.sid', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    res.json({ message: 'Logged out successfully' });
  });
});


// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'applytrack',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Welcome route and database health check
app.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      message: 'Welcome to the ApplyTrack API!',
      database: 'MySQL connected'
    });
  } catch (error) {
    console.error('MySQL health check failed:', error.message);

    res.status(500).json({
      error: 'MySQL connection failed'
    });
  }
});

// GET: Retrieve all applications
app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const [jobs] = await pool.execute(
      'SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC',
      [req.session.userId]
    );

    res.json(jobs);
  } catch (error) {
    console.error('Fetch applications error:', error.message);

    res.status(500).json({
      error: 'Failed to fetch applications'
    });
  }
});

// GET: Retrieve one application
app.get('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const [jobs] = await pool.execute(
  'SELECT * FROM applications WHERE id = ? AND user_id = ?',
  [req.params.id, req.session.userId]
);

    if (jobs.length === 0) {
      return res.status(404).json({
        error: 'Application not found'
      });
    }

    res.json(jobs[0]);
  } catch (error) {
    console.error('Get application error:', error.message);

    res.status(500).json({
      error: 'Failed to retrieve application'
    });
  }
});

// POST: Add an application
app.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const { 
    company,
    role,
    date,
    status,
    description = ''
  } = req.body;

    if (
      typeof company !== 'string' ||
      !company.trim() ||
      typeof role !== 'string' ||
      !role.trim() ||
      !date
    ) {
      return res.status(400).json({
        error: 'Company, role, and date are required'
      });
    }

    const allowedStatuses = [
      'Applied',
      'Interview',
      'Pending',
      'Rejected',
      'Offer'
    ];

    const applicationStatus = status || 'Applied';

    if (!allowedStatuses.includes(applicationStatus)) {
      return res.status(400).json({
        error: 'Invalid application status'
      });
    }

    const [result] = await pool.execute(
  `INSERT INTO applications
   (company, role, date, status, description, user_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [
    company.trim(),
    role.trim(),
    date,
    applicationStatus,
    typeof description === 'string' ? description.trim() : '',
    req.session.userId
  ]
);

    const [jobs] = await pool.execute(
      'SELECT * FROM applications WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(jobs[0]);
  } catch (error) {
    console.error('Add application error:', error.message);

    res.status(500).json({
      error: 'Failed to add application. Check the date and database table.'
    });
  }
});

// PUT: Update an application
app.put('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const {
  company,
  role,
  date,
  status,
  description = ''
} = req.body;

    if (
      typeof company !== 'string' ||
      !company.trim() ||
      typeof role !== 'string' ||
      !role.trim() ||
      !date ||
      !status
    ) {
      return res.status(400).json({
        error: 'Company, role, date, and status are required'
      });
    }

    const allowedStatuses = [
      'Applied',
      'Interview',
      'Pending',
      'Rejected',
      'Offer'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid application status'
      });
    }

    const [result] = await pool.execute(
  `UPDATE applications
   SET company = ?, role = ?, date = ?, status = ?, description = ?
   WHERE id = ? AND user_id = ?`,
  [
    company.trim(),
    role.trim(),
    date,
    status,
    typeof description === 'string' ? description.trim() : '',
    req.params.id,
    req.session.userId
  ]
);

    const [ownedJobs] = await pool.execute(
  'SELECT id FROM applications WHERE id = ? AND user_id = ?',
  [req.params.id, req.session.userId]
);

if (ownedJobs.length === 0) {
  return res.status(404).json({
    error: 'Application not found'
  });
}
        const [jobs] = await pool.execute(
      'SELECT * FROM applications WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );

    return res.json(jobs[0]);
  } catch (error) {
    console.error('Update application error:', error.message);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      error: 'Failed to update application'
    });
  }
});

// DELETE: Remove an application
app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const [result] = await pool.execute(
  'DELETE FROM applications WHERE id = ? AND user_id = ?',
  [req.params.id, req.session.userId]
);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Application not found'
      });
    }

    res.json({
      message: 'Application deleted successfully'
    });
  } catch (error) {
    console.error('Delete application error:', error.message);

    res.status(500).json({
      error: 'Failed to delete application'
    });
  }
});

// Start the server only after verifying MySQL connectivity
const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await pool.query('SELECT 1');

    console.log('Connected to MySQL successfully!');

    app.listen(PORT, () => {
      console.log(
        `ApplyTrack API running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    console.error(
      'Check your server/.env credentials and ensure MySQL is running.'
    );

    process.exit(1);
  }
}

startServer();
