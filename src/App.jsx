import { useEffect, useMemo, useState } from 'react';
import './App.css';
import JDMatcher from './JDMatcher';
import Login from './auth/Login';
import Register from './auth/Register';


const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');
const STATUSES = [
  'Applied',
  'Interview',
  'Pending',
  'Rejected',
  'Offer',
];

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
}

function App() {
  const [jobs, setJobs] = useState([]);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState(() => {
  return localStorage.getItem('applytrack-theme') || 'light';
});

useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('applytrack-theme', theme);
}, [theme]);

const toggleTheme = () => {
  setTheme((currentTheme) =>
    currentTheme === 'light' ? 'dark' : 'light'
  );
};
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);

  // Calculate analytics from the applications loaded from MySQL.
  const counts = useMemo(() => {
    const result = {
      total: jobs.length,
      Applied: 0,
      Interview: 0,
      Pending: 0,
      Rejected: 0,
      Offer: 0,
    };

    jobs.forEach((job) => {
      if (Object.prototype.hasOwnProperty.call(result, job.status)) {
        result[job.status] += 1;
      }
    });

    return result;
  }, [jobs]);

  const interviewRate = counts.total
    ? Math.round((counts.Interview / counts.total) * 100)
    : 0;

  const outcomeRate = counts.total
    ? Math.round((counts.Offer / counts.total) * 100)
    : 0;

  const filteredJobs = useMemo(() => {
    const query = search.toLowerCase().trim();

    return jobs.filter((job) => {
      const searchableText =
        `${job.company || ''} ${job.role || ''}`.toLowerCase();

      const matchesSearch = searchableText.includes(query);
      const matchesStatus =
        statusFilter === 'All statuses' ||
        job.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [jobs, search, statusFilter]);

  // Restore the session before loading private application data.
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: 'include',
        });

        if (response.status === 401) return;
        if (!response.ok) throw new Error('Could not verify your session.');

        const data = await response.json();
        if (active) setUser(data.user);
      } catch (error) {
        console.error('Session restoration failed:', error);
        if (active) {
          setAuthError('Could not connect to ApplyTrack. Make sure the backend is running.');
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    restoreSession();
    return () => { active = false; };
  }, []);

  // Fetch only the authenticated user's applications.
  useEffect(() => {
    let active = true;

    if (!user) {
      setJobs([]);
      setIsLoading(false);
      return () => { active = false; };
    }

    async function loadJobs() {
      setIsLoading(true);
      try {
        setApiError('');
        const response = await fetch(`${API_URL}/jobs`, {
          credentials: 'include',
        });

        if (response.status === 401) {
          if (active) {
            setUser(null);
            setAuthMode('login');
            setAuthError('Your session expired. Please sign in again.');
          }
          return;
        }
        if (!response.ok) throw new Error('Could not load applications.');

        const data = await response.json();
        if (active) setJobs(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        if (active) setApiError('Could not connect to the backend. Make sure your server and MySQL are running.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadJobs();
    return () => { active = false; };
  }, [user]);

  async function logout() {
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok && response.status !== 401) {
        throw new Error('Could not log out. Please try again.');
      }
      setUser(null);
      setJobs([]);
      setAuthMode('login');
      setAuthError('');
      setApiError('');
    } catch (error) {
      setApiError(error.message || 'Could not log out.');
    }
  }

  // Add a new application or edit an existing application.
  async function saveApplication(application) {
    try {
      setApiError('');

      const isEditing = Boolean(editingJob);

      const url = isEditing
        ? `${API_URL}/jobs/${editingJob.id}`
        : `${API_URL}/jobs`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(application),
      });

      const savedJob = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          savedJob.message ||
            savedJob.error ||
            'Could not save application.'
        );
      }

      if (isEditing) {
        setJobs((current) =>
          current.map((job) =>
            job.id === savedJob.id ? savedJob : job
          )
        );
      } else {
        setJobs((current) => [...current, savedJob]);
      }

      setShowForm(false);
      setEditingJob(null);
    } catch (error) {
      setApiError(error.message || 'Could not save application.');
      console.error(error);
      throw error;
    }
  }

  // Update the status and refresh the analytics automatically.
  async function updateStatus(id, newStatus) {
    const previousJobs = jobs;
    const existing = jobs.find((job) => job.id === id);

    if (!existing) return;

    setJobs((current) =>
      current.map((job) =>
        job.id === id ? { ...job, status: newStatus } : job
      )
    );

    try {
      setApiError('');

      const response = await fetch(`${API_URL}/jobs/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
  company: existing.company,
  role: existing.role,
  date: existing.date
    ? String(existing.date).slice(0, 10)
    : '',
  status: newStatus,
  description: existing.description || '',
}),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            'Could not update application status.'
        );
      }

      setJobs((current) =>
        current.map((job) => (job.id === id ? data : job))
      );
    } catch (error) {
      console.error('Status update failed:', error);
      setJobs(previousJobs);
      setApiError(`Status update failed: ${error.message}`);
    }
  }

  // Delete an application.
  async function deleteApplication(job) {
    if (
      !window.confirm(
        `Delete the application for ${job.company}?`
      )
    ) {
      return;
    }

    try {
      setApiError('');

      const response = await fetch(`${API_URL}/jobs/${job.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            'Could not delete application.'
        );
      }

      setJobs((current) =>
        current.filter((item) => item.id !== job.id)
      );
    } catch (error) {
      setApiError(error.message || 'Could not delete application.');
      console.error(error);
    }
  }

  function openNewForm() {
    setEditingJob(null);
    setShowForm(true);
  }

  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">ApplyTrack</div>
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authError && !authError.toLowerCase().includes('session expired')) {
      return (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-brand">ApplyTrack</div>
            <p className="auth-error" role="alert">{authError}</p>
            <button type="button" onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      );
    }

    return authMode === 'register' ? (
      <Register
        onRegister={(newUser) => { setAuthError(''); setUser(newUser); }}
        onSwitchToLogin={() => { setAuthError(''); setAuthMode('login'); }}
      />
    ) : (
      <Login
        onLogin={(loggedInUser) => { setAuthError(''); setUser(loggedInUser); }}
        onSwitchToRegister={() => { setAuthError(''); setAuthMode('register'); }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#dashboard"
          aria-label="ApplyTrack home"
        >
          <span className="brand-mark">A</span>
          <span>
            ApplyTrack<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#dashboard">
            <span className="nav-icon">▦</span>
            Dashboard
          </a>

          <a className="nav-link" href="#applications">
            <span className="nav-icon">▤</span>
            Applications
          </a>

          <a className="nav-link" href="#analytics">
            <span className="nav-icon">◔</span>
            Analytics
          </a>
          <a className="nav-link" href="#jd-matcher">
            <span className="nav-icon">▤</span>
            JD Matcher
          </a>
        </nav>

        <div className="sidebar-tip">
          <strong>Small steps add up.</strong>
          <p>
            Every application brings you closer to your next opportunity.
          </p>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar" aria-hidden="true">
            {(user.name || user.email || 'U').trim().charAt(0).toUpperCase()}
          </div>
          <div className="profile-copy">
            <strong>{user.name || 'Job Seeker'}</strong>
            <span>{user.email}</span>
          </div>
          <button type="button" className="profile-menu" onClick={logout} aria-label="Log out" title="Log out">
            ↪
          </button>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>Dashboard</strong>


            
          </div>

          

          <div className="topbar-right">
            <span className="live-dot" />
            Your career, organized

            <button
  type="button"
  className="theme-toggle"
  onClick={toggleTheme}
  aria-label={
    theme === 'light'
      ? 'Switch to dark mode'
      : 'Switch to light mode'
  }
  title={
    theme === 'light'
      ? 'Switch to dark mode'
      : 'Switch to light mode'
  }
>
  <span aria-hidden="true">
    {theme === 'light' ? '☾' : '☀'}
  </span>
</button>
          </div>

          

        </header>

        <div className="page-content">
          <section className="welcome-section">
            <div className="welcome-copy">
              <p className="eyebrow">
                YOUR JOB SEARCH, AT A GLANCE
              </p>
              <h1>
                Good things take <span>progress.</span>
              </h1>
              <p className="welcome-description">
                Keep every opportunity in one place and make your next
                move with confidence.
              </p>
            </div>

            <button
              className="primary-button add-button"
              onClick={openNewForm}
            >
              <span aria-hidden="true">＋</span>
              Add application
            </button>
            
          </section>

          {apiError && (
            <div className="api-error" role="alert">
              <span>!</span>
              <div>{apiError}</div>
              <button
                onClick={() => setApiError('')}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {isLoading && (
            <div className="loading-banner" role="status">
              <span className="spinner" />
              Loading your applications…
            </div>
          )}

          {/* Analytics summary cards */}
          <section
            className="stats-grid"
            aria-label="Application summary"
          >
            <StatCard
              title="Total applications"
              value={counts.total}
              icon="▤"
              tone="violet"
              detail="All opportunities tracked"
            />

            <StatCard
              title="Interviews"
              value={counts.Interview}
              icon="▣"
              tone="blue"
              detail="Conversations in progress"
            />

            <StatCard
              title="Offers received"
              value={counts.Offer}
              icon="✦"
              tone="green"
              detail="Wins worth celebrating"
            />

            <StatCard
              title="Interview rate"
              value={`${interviewRate}%`}
              icon="↗"
              tone="amber"
              detail="Interviews ÷ all applications"
            />
          </section>

          {/* Detailed analytics */}
          <section className="analytics-grid" id="analytics">
            <article className="panel status-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">YOUR PIPELINE</p>
                  <h2>Application overview</h2>
                  <p className="panel-subtitle">
                    A snapshot of where things stand.
                  </p>
                </div>

                <span className="panel-icon" aria-hidden="true">
                  ◔
                </span>
              </div>

              <div className="status-list">
                {STATUSES.map((status) => {
                  const amount = counts[status];
                  const percent = counts.total
                    ? Math.round((amount / counts.total) * 100)
                    : 0;

                  return (
                    <div className="status-row" key={status}>
                      <div className="status-row-top">
                        <span
                          className={`status-dot dot-${status.toLowerCase()}`}
                        />
                        <span className="status-name">{status}</span>
                        <strong>{amount}</strong>
                        <span className="status-percent">
                          {percent}%
                        </span>
                      </div>

                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${status} applications`}
                        aria-valuenow={percent}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <span
                          className={`progress-fill fill-${status.toLowerCase()}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel focus-panel">
              <div className="focus-orb" aria-hidden="true">
                <span>↗</span>
              </div>

              <p className="eyebrow">KEEP THE MOMENTUM</p>

              <h2>
                Your next opportunity starts with one step.
              </h2>

              <p className="focus-description">
                Log new applications, keep statuses current, and use
                your pipeline to decide where to follow up next.
              </p>

              <div className="focus-metrics">
                <div>
                  <strong>{counts.Applied + counts.Pending}</strong>
                  <span>Awaiting progress</span>
                </div>
                <div>
                  <strong>{counts.Rejected}</strong>
                  <span>Closed applications</span>
                </div>
              </div>

              <button
                className="secondary-button focus-button"
                onClick={openNewForm}
              >
                Track an opportunity
                <span aria-hidden="true">→</span>
              </button>
            </article>
          </section>

          {/* Additional outcome analytics */}
          <section className="panel outcome-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PERFORMANCE</p>
                <h2>Application outcomes</h2>
                <p className="panel-subtitle">
                  Understand how your job search is progressing.
                </p>
              </div>
            </div>

            <div className="outcome-grid">
              <OutcomeItem
                label="Applied"
                value={counts.Applied}
                total={counts.total}
                tone="violet"
              />
              <OutcomeItem
                label="Interview"
                value={counts.Interview}
                total={counts.total}
                tone="blue"
              />
              <OutcomeItem
                label="Pending"
                value={counts.Pending}
                total={counts.total}
                tone="amber"
              />
              <OutcomeItem
                label="Offers"
                value={counts.Offer}
                total={counts.total}
                tone="green"
              />
              <OutcomeItem
                label="Rejected"
                value={counts.Rejected}
                total={counts.total}
                tone="red"
              />
            </div>

            <div className="analytics-insights">
              <div>
                <span>Offer rate</span>
                <strong>{outcomeRate}%</strong>
                <p>Offers as a percentage of all applications.</p>
              </div>
              <div>
                <span>Active opportunities</span>
                <strong>
                  {counts.Applied +
                    counts.Interview +
                    counts.Pending}
                </strong>
                <p>
                  Applications not currently marked as offered or
                  rejected.
                </p>
              </div>
            </div>
          </section>
          {/* Resume and Job Description Matcher */}
          <JDMatcher />
          {/* Applications table */}
          <section
            className="panel applications-panel"
            id="applications"
          >
            <div className="panel-heading applications-heading">
              <div>
                <p className="eyebrow">YOUR PIPELINE</p>
                <h2>Recent applications</h2>
                <p className="panel-subtitle">
                  Manage and monitor your job opportunities.
                </p>
              </div>

              <div className="table-controls">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="Search company or role"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    aria-label="Search applications"
                  />
                </label>

                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                  aria-label="Filter by status"
                >
                  <option>All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>COMPANY &amp; ROLE</th>
                    <th>DATE APPLIED</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {!isLoading &&
                    filteredJobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <div className="company-cell">
                            <span
                              className="company-avatar"
                              aria-hidden="true"
                            >
                              {(job.company || '?')
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <span className="company-details">
                              <button
  type="button"
  className="company-name-button"
  onClick={() => setSelectedJob(job)}
>
  {job.company}
</button>
                              <span>{job.role}</span>
                            </span>
                          </div>
                        </td>

                        <td className="date-cell">
                          {formatDate(job.date)}
                        </td>

                        <td>
                          <select
                            className={`status-select status-${String(
                              job.status
                            ).toLowerCase()}`}
                            value={job.status}
                            onChange={(event) =>
                              updateStatus(
                                job.id,
                                event.target.value
                              )
                            }
                            aria-label={`Status for ${job.company}`}
                          >
                            {STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <div className="action-buttons">
                            <button
                              className="text-button edit-button"
                              onClick={() => {
                                setEditingJob(job);
                                setShowForm(true);
                              }}
                            >
                              Edit
                            </button>

                            <button
                              className="text-button delete-button"
                              onClick={() => deleteApplication(job)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                  {!isLoading && filteredJobs.length === 0 && (
                    <tr>
                      <td colSpan="4">
                        <div className="empty-state">
                          <strong>
                            {search ||
                            statusFilter !== 'All statuses'
                              ? 'No matching applications'
                              : 'Your tracker starts here'}
                          </strong>

                          <p>
                            {search ||
                            statusFilter !== 'All statuses'
                              ? 'Try changing your search or filter.'
                              : 'Add your first application to start building your pipeline.'}
                          </p>

                          {!search &&
                            statusFilter === 'All statuses' && (
                              <button
                                className="primary-button"
                                onClick={openNewForm}
                              >
                                ＋ Add application
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing <strong>{filteredJobs.length}</strong> of{' '}
                <strong>{jobs.length}</strong> applications
              </span>
              <span>Changes sync with your database</span>
            </div>
          </section>

          <footer className="footer">
            <span>© {new Date().getFullYear()} ApplyTrack</span>
            <span>Stay organized. Keep moving forward.</span>
          </footer>
        </div>
        

{selectedJob && (
  <div
    className="modal-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setSelectedJob(null);
      }
    }}
  >
    <section
      className="form-modal job-details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-details-title"
    >
      <div className="job-details-topline">
        <span className="job-details-eyebrow">
          APPLICATION DETAILS
        </span>
        <button
          type="button"
          className="close-button"
          onClick={() => setSelectedJob(null)}
          aria-label="Close job details"
        >
          ×
        </button>
      </div>

      <div className="job-details-hero">
        <div className="job-company-icon" aria-hidden="true">
          {(selectedJob.company || '?')
            .trim()
            .charAt(0)
            .toUpperCase()}
        </div>

        <div className="job-details-heading">
          <h2 id="job-details-title">
            {selectedJob.company}
          </h2>
          <p>{selectedJob.role}</p>

          <span
            className={`job-status-pill status-${String(
              selectedJob.status || 'Applied'
            ).toLowerCase()}`}
          >
            <span className="job-status-dot" />
            {selectedJob.status || 'Applied'}
          </span>
        </div>
      </div>

      <div className="job-details-divider" />

      <div className="job-details-metadata">
        <div className="job-metadata-card">
          <span className="job-metadata-icon">▦</span>
          <div>
            <span className="job-metadata-label">
              APPLICATION DATE
            </span>
            <strong>{formatDate(selectedJob.date)}</strong>
          </div>
        </div>

        <div className="job-metadata-card">
          <span className="job-metadata-icon">◷</span>
          <div>
            <span className="job-metadata-label">
              APPLICATION STATUS
            </span>
            <strong>{selectedJob.status || 'Applied'}</strong>
          </div>
        </div>
      </div>

      <section className="job-description-card">
        <div className="job-description-heading">
          <div>
            <h3>Job description</h3>
            <p>Role overview and requirements</p>
          </div>
          <span className="job-description-icon">≡</span>
        </div>

        <div className="job-description-body">
          {selectedJob.description?.trim() ? (
            <p className="job-description-text">
              {selectedJob.description}
            </p>
          ) : (
            <div className="job-description-empty">
              <span className="job-empty-icon">＋</span>
              <strong>No job description yet</strong>
              <p>
                Add the job description to keep all the
                important requirements in one place.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="job-details-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setSelectedJob(null)}
        >
          Close
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEditingJob(selectedJob);
            setSelectedJob(null);
            setShowForm(true);
          }}
        >
          <span aria-hidden="true">✎</span>
          Edit application
        </button>
      </div>
    </section>
  </div>
)}


        {showForm && (
          <ApplicationForm
            initialJob={editingJob}
            onSave={saveApplication}
            onClose={() => {
              setShowForm(false);
              setEditingJob(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, tone, detail }) {
  return (
    <article className="stat-card">
      <div
        className={`stat-icon icon-${tone}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="stat-title">{title}</p>
      <div className="stat-value">{value}</div>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}

function OutcomeItem({ label, value, total, tone }) {
  const percentage = total
    ? Math.round((value / total) * 100)
    : 0;

  return (
    <article className={`outcome-item outcome-${tone}`}>
      <div className="outcome-item-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div
        className="outcome-track"
        role="progressbar"
        aria-label={`${label} share`}
        aria-valuenow={percentage}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <p>{percentage}% of applications</p>
    </article>
  );
}

function ApplicationForm({ onSave, onClose, initialJob }) {
  // Read the app's active theme so modal fields stay readable in both modes.
  const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
  const formControlStyle = {
    backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
    color: isDarkTheme ? '#f1f5f9' : '#1f2937',
    borderColor: isDarkTheme ? '#475569' : '#d1d5db',
    colorScheme: isDarkTheme ? 'dark' : 'light',
  };

  const [company, setCompany] = useState(initialJob?.company ?? '');
  const [role, setRole] = useState(initialJob?.role ?? '');
  const [description, setDescription] = useState(
  initialJob?.description ?? '');
  const [date, setDate] = useState(
    initialJob?.date
      ? String(initialJob.date).slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState(
    initialJob?.status ?? 'Applied'
  );
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!company.trim() || !role.trim() || !date) {
      setError('Please fill in all required fields.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave({
  company: company.trim(),
  role: role.trim(),
  date,
  status,
  description: description.trim(),
});
    } catch (saveError) {
      setError(saveError.message || 'Could not save application.');
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !isSaving) onClose();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <section
        className="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">JOB TRACKER</p>
            <h2 id="form-title">
              {initialJob ? 'Edit application' : 'Add an application'}
            </h2>
            <p className="panel-subtitle">
              A few details help you keep everything organized.
            </p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="company">
            Company name <span>*</span>
          </label>
          <input
            id="company"
            style={formControlStyle}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="e.g. IBM"
            autoFocus
            required
            maxLength={150}
          />

          <label htmlFor="role">
            Job title <span>*</span>
          </label>
          <input
            id="role"
            style={formControlStyle}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="e.g. Associate Engineer"
            required
            maxLength={150}
          />

          <label htmlFor="description">
  Job description
</label>
<textarea
  id="description"
  style={formControlStyle}
  value={description}
  onChange={(event) => setDescription(event.target.value)}
  placeholder="Paste the full job description here..."
  rows={6}
/>

          <label htmlFor="date">
            Application date <span>*</span>
          </label>
          <input
            id="date"
            type="date"
            style={formControlStyle}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />

          <label htmlFor="status">Application status</label>
          <select
            id="status"
            style={formControlStyle}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={isSaving}
            >
              {isSaving
                ? 'Saving…'
                : initialJob
                  ? 'Save changes'
                  : 'Save application'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
