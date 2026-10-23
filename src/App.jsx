
import { useState, useEffect } from 'react';
import './App.css';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5000/api';

function App() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);

  // Calculate dashboard statistics
  const counts = {
    total: jobs.length,
    applied: jobs.filter((job) => job.status === 'Applied').length,
    interview: jobs.filter((job) => job.status === 'Interview').length,
    pending: jobs.filter((job) => job.status === 'Pending').length,
  };

  // Filter applications using the search box
  const filteredJobs = jobs.filter((job) => {
    const query = search.toLowerCase().trim();

    return (
      job.company.toLowerCase().includes(query) ||
      job.role.toLowerCase().includes(query)
    );
  });

  // Load applications from the backend
  useEffect(() => {
    async function loadJobs() {
      try {
        setApiError('');

        const response = await fetch(`${API_URL}/jobs`);

        if (!response.ok) {
          throw new Error('Could not load applications.');
        }

        const data = await response.json();
        setJobs(data);
      } catch (error) {
        setApiError(
          'Could not connect to the backend. Make sure your server is running.'
        );
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }

    loadJobs();
  }, []);

  // Add a new application or edit an existing one
  async function saveApplication(application) {
    try {
      setApiError('');

      const isEditing = Boolean(editingJob);

      const url = isEditing
        ? `${API_URL}/jobs/${editingJob.id}`
        : `${API_URL}/jobs`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(application),
      });

      const savedJob = await response.json();

      if (!response.ok) {
        throw new Error(
          savedJob.message || 'Could not save application.'
        );
      }

      if (isEditing) {
        setJobs((currentJobs) =>
          currentJobs.map((job) =>
            job.id === savedJob.id ? savedJob : job
          )
        );
      } else {
        setJobs((currentJobs) => [...currentJobs, savedJob]);
      }

      setShowForm(false);
      setEditingJob(null);
    } catch (error) {
      setApiError(
        error.message || 'Could not save application.'
      );
      console.error(error);
    }
  }

  // Update an application's status
  
const updateStatus = async (id, newStatus) => {
  const previousJobs = jobs;

  // Update the UI immediately
  setJobs((currentJobs) =>
    currentJobs.map((job) =>
      job.id === id ? { ...job, status: newStatus } : job
    )
  );

  try {
    const response = await fetch(`${API_URL}/jobs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company: jobs.find((job) => job.id === id)?.company,
        role: jobs.find((job) => job.id === id)?.role,
        date: jobs.find((job) => job.id === id)?.date?.slice(0, 10),
        status: newStatus,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Could not update status');
    }

    const updatedJob = await response.json();

    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === id ? updatedJob : job
      )
    );
  } catch (error) {
    console.error('Status update failed:', error);
    setJobs(previousJobs);
    alert(`Could not update status: ${error.message}`);
  }
};

  // Delete an application from the backend
  async function deleteApplication(job) {
    const confirmed = window.confirm(
      `Delete the application for ${job.company}?`
    );

    if (!confirmed) return;

    try {
      setApiError('');

      const response = await fetch(
        `${API_URL}/jobs/${job.id}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Could not delete application.'
        );
      }

      setJobs((currentJobs) =>
        currentJobs.filter((item) => item.id !== job.id)
      );
    } catch (error) {
      setApiError(
        error.message || 'Could not delete application.'
      );
      console.error(error);
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2 className="brand">
          ApplyTrack<span>.</span>
        </h2>

        <p className="nav-heading">WORKSPACE</p>
        <div className="nav-item active">▦ Dashboard</div>
        <div className="nav-item">▤ Applications</div>
        <div className="nav-item">▦ Interviews</div>

        <div className="sidebar-bottom">
          <div className="avatar">S</div>
          <div>
            <strong>Job Seeker</strong>
            <p>My workspace</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>My Workspace / Dashboard</span>
          <span className="today">Your career, organized.</span>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR JOB SEARCH</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Keep track of every opportunity and your next career move.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setEditingJob(null);
              setShowForm(true);
            }}
          >
            + Add Application
          </button>
        </section>

        {/* Loading and error messages */}
        {isLoading && (
          <p role="status">Loading applications...</p>
        )}

        {apiError && (
          <p role="alert" className="api-error">
            {apiError}
          </p>
        )}

        <section className="stats-grid">
          <StatCard
            title="Total Applications"
            value={counts.total}
            icon="▤"
          />
          <StatCard
            title="Applied"
            value={counts.applied}
            icon="↗"
          />
          <StatCard
            title="Interviews"
            value={counts.interview}
            icon="▣"
          />
          <StatCard
            title="Awaiting Response"
            value={counts.pending}
            icon="◷"
          />
        </section>

        <section className="applications-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Applications</h2>
              <p>Manage and monitor your job opportunities.</p>
            </div>

            <input
              className="search-input"
              type="search"
              placeholder="Search jobs..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
                        <strong>{job.company}</strong>
                        <span className="role-name">
                          {job.role}
                        </span>
                      </td>

                      <td>{job.date}</td>

                      <td>
                        <select
                          className={`status-select status-${job.status.toLowerCase()}`}
                          value={job.status}
                          onChange={(event) =>
                            updateStatus(job.id, event.target.value)
                          }
                          aria-label={`Status for ${job.company}`}
                        >
                          <option>Applied</option>
                          <option>Interview</option>
                          <option>Pending</option>
                          <option>Rejected</option>
                          <option>Offer</option>
                        </select>
                      </td>

                      <td>
                        <div className="action-buttons">
                          <button
                            className="edit-button"
                            onClick={() => {
                              setEditingJob(job);
                              setShowForm(true);
                            }}
                          >
                            Edit
                          </button>

                          <button
                            className="delete-button"
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
                    <td colSpan={4} className="empty-state">
                      {search
                        ? 'No applications match your search.'
                        : 'No applications yet. Add your first application!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="footer">
          ApplyTrack · Stay organized. Keep moving forward.
        </footer>

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

function StatCard({ title, value, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">{icon}</span>
      </div>

      <strong className="stat-value">{value}</strong>
      <p>Across your tracked opportunities</p>
    </article>
  );
}

function ApplicationForm({ onSave, onClose, initialJob }) {
  const [company, setCompany] = useState(
    initialJob?.company ?? ''
  );

  const [role, setRole] = useState(
    initialJob?.role ?? ''
  );

  const [date, setDate] = useState(
    initialJob?.date ?? new Date().toISOString().slice(0, 10)
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
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
              {initialJob ? 'Edit Application' : 'Add Application'}
            </h2>
            <p className="subtitle">
              Keep your job search organized.
            </p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="company">Company name *</label>
          <input
            id="company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="e.g. IBM"
            required
          />

          <label htmlFor="role">Job title *</label>
          <input
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="e.g. Associate Engineer"
            required
          />

          <label htmlFor="date">Application date *</label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />

          <label htmlFor="status">Application status</label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>Applied</option>
            <option>Interview</option>
            <option>Pending</option>
            <option>Rejected</option>
            <option>Offer</option>
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
                ? 'Saving...'
                : initialJob
                  ? 'Save Changes'
                  : 'Save Application'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
