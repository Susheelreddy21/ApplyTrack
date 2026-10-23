
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(cors());
app.use(express.json());

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
app.get('/api/jobs', async (req, res) => {
  try {
    const [jobs] = await pool.execute(
      'SELECT * FROM applications ORDER BY id DESC'
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
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const [jobs] = await pool.execute(
      'SELECT * FROM applications WHERE id = ?',
      [req.params.id]
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
app.post('/api/jobs', async (req, res) => {
  try {
    const { company, role, date, status } = req.body;

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
       (company, role, date, status)
       VALUES (?, ?, ?, ?)`,
      [company.trim(), role.trim(), date, applicationStatus]
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
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const { company, role, date, status } = req.body;

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
       SET company = ?, role = ?, date = ?, status = ?
       WHERE id = ?`,
      [company.trim(), role.trim(), date, status, req.params.id]
    );

    if (result.affectedRows === 0) {
      const [existing] = await pool.execute(
        'SELECT id FROM applications WHERE id = ?',
        [req.params.id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }
    }

    const [jobs] = await pool.execute(
      'SELECT * FROM applications WHERE id = ?',
      [req.params.id]
    );

    res.json(jobs[0]);
  } catch (error) {
    console.error('Update application error:', error.message);

    res.status(500).json({
      error: 'Failed to update application'
    });
  }
});

// DELETE: Remove an application
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM applications WHERE id = ?',
      [req.params.id]
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
