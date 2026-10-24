import { useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import './JDMatcher.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SKILL_GROUPS = [
  { name: 'Java', terms: ['java', 'core java', 'java programming'] },
  { name: 'Python', terms: ['python', 'python programming'] },
  { name: 'JavaScript', terms: ['javascript', 'js programming'] },
  { name: 'SQL', terms: ['sql', 'structured query language'] },
  { name: 'MySQL', terms: ['mysql', 'my sql'] },
  { name: 'PostgreSQL', terms: ['postgresql', 'postgres', 'postgre sql'] },
  { name: 'React', terms: ['react', 'react.js', 'reactjs'] },
  { name: 'Node.js', terms: ['node.js', 'nodejs', 'node js'] },
  { name: 'Express.js', terms: ['express.js', 'expressjs', 'express js'] },
  { name: 'Spring Boot', terms: ['spring boot', 'springboot'] },
  {
    name: 'REST APIs',
    terms: [
      'rest api',
      'rest apis',
      'restful api',
      'restful apis',
      'representational state transfer',
    ],
  },
  { name: 'HTML', terms: ['html', 'hypertext markup language'] },
  { name: 'CSS', terms: ['css', 'cascading style sheets'] },
  { name: 'Git', terms: ['git', 'git version control'] },
  { name: 'GitHub', terms: ['github', 'git hub'] },
  { name: 'AWS', terms: ['aws', 'amazon web services'] },
  { name: 'Azure', terms: ['azure', 'microsoft azure', 'ms azure'] },
  { name: 'Docker', terms: ['docker', 'containerization', 'containerisation'] },
  { name: 'Kubernetes', terms: ['kubernetes', 'k8s'] },
  { name: 'Linux', terms: ['linux', 'linux operating system'] },
  { name: 'Machine Learning', terms: ['machine learning'] },
  { name: 'Deep Learning', terms: ['deep learning'] },
  { name: 'Data Structures', terms: ['data structures', 'data structure', 'dsa'] },
  { name: 'Algorithms', terms: ['algorithms', 'algorithm', 'algorithm design'] },
  {
    name: 'OOP',
    terms: [
      'oop',
      'oops',
      'object oriented programming',
      'object-oriented programming',
    ],
  },
  { name: 'MongoDB', terms: ['mongodb', 'mongo db'] },
  { name: 'Angular', terms: ['angular', 'angular framework'] },
  { name: 'TypeScript', terms: ['typescript', 'type script'] },
  { name: 'Power BI', terms: ['power bi', 'powerbi'] },
  { name: 'Excel', terms: ['excel', 'microsoft excel', 'ms excel'] },
  {
    name: 'Communication',
    terms: [
      'communication skills',
      'verbal communication',
      'written communication',
    ],
  },
  { name: 'Problem Solving', terms: ['problem solving', 'problem-solving'] },
  { name: 'Agile', terms: ['agile', 'agile methodology', 'scrum'] },
  { name: 'Jenkins', terms: ['jenkins'] },
  { name: 'Terraform', terms: ['terraform'] },
  {
    name: 'Networking',
    terms: ['computer networks', 'computer networking', 'networking'],
  },
];

function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.split(/\s+/).join('\\s+');

  return new RegExp(
    `(^|[^a-z0-9+#])${pattern}(?=$|[^a-z0-9+#])`,
    'i'
  ).test(text);
}

function findSkills(text) {
  const normalizedText = text
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-');

  return SKILL_GROUPS
    .filter((skill) =>
      skill.terms.some((term) => containsTerm(normalizedText, term))
    )
    .map((skill) => skill.name);
}

/**
 * Extract PDF text while preserving line breaks where possible.
 * Orders text approximately top-to-bottom and left-to-right.
 */
async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const items = content.items
      .filter((item) => 'str' in item && item.str.trim())
      .map((item) => ({
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        width: item.width ?? 0,
        text: item.str.trim(),
      }));

    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });

    const lines = [];

    for (const item of items) {
      let line = lines.find(
        (existing) => Math.abs(existing.y - item.y) <= 3
      );

      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }

      line.items.push(item);
    }

    lines.sort((a, b) => b.y - a.y);

    const pageText = lines
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);

        let result = '';

        for (let index = 0; index < line.items.length; index++) {
          const item = line.items[index];

          if (index === 0) {
            result = item.text;
            continue;
          }

          const previous = line.items[index - 1];
          const gap = item.x - (previous.x + previous.width);

          if (gap > 1.5 && !/[-/([{]$/.test(result)) {
            result += ' ';
          }

          result += item.text;
        }

        return result
          .replace(/[ \t]+/g, ' ')
          .replace(/\s+([,.;:!?])/g, '$1')
          .trim();
      })
      .filter(Boolean);

    pages.push(pageText.join('\n'));
  }

  return pages.join('\n\n');
}

function cleanExtractedText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function JDMatcher() {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  const canAnalyze =
    resumeText.trim().length >= 30 &&
    jobDescription.trim().length >= 30;

  const resumeCount = useMemo(
    () => (resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0),
    [resumeText]
  );

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError('');
    setAnalysis(null);

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!['pdf', 'docx'].includes(extension)) {
      setError('Please upload a PDF or DOCX file.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('The resume file must be smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    setIsReadingFile(true);

    try {
      let extractedText = '';

      if (extension === 'pdf') {
        extractedText = await extractPdfText(file);
      } else {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({
          arrayBuffer: buffer,
        });

        extractedText = result.value;
      }

      const cleanedText = cleanExtractedText(extractedText);

      if (!cleanedText || cleanedText.replace(/\s/g, '').length < 40) {
        throw new Error(
          'Very little readable text was found. If this is a scanned PDF, OCR is required to read the text.'
        );
      }

      setResumeText(cleanedText);
      setUploadedFileName(file.name);
    } catch (err) {
      console.error('Resume extraction error:', err);

      setError(
        err.message ||
          'Could not read this file. Please try another PDF or DOCX document.'
      );

      setUploadedFileName('');
    } finally {
      setIsReadingFile(false);
      event.target.value = '';
    }
  }

  function analyzeMatch(event) {
    event.preventDefault();
    setError('');
    setAnalysis(null);

    if (!canAnalyze) {
      setError(
        'Please enter both your resume text and the complete job description.'
      );
      return;
    }

    const resumeSkills = findSkills(resumeText);
    const requiredSkills = findSkills(jobDescription);

    if (!requiredSkills.length) {
      setError(
        'No supported skills were identified. Try including specific skills such as Java, Python, SQL, AWS or React.'
      );
      return;
    }

    const matchedSkills = requiredSkills.filter((skill) =>
      resumeSkills.includes(skill)
    );

    const missingSkills = requiredSkills.filter(
      (skill) => !resumeSkills.includes(skill)
    );

    const score = Math.round(
      (matchedSkills.length / requiredSkills.length) * 100
    );

    const suggestions = [];

    if (missingSkills.length) {
      suggestions.push(
        `Review these job requirements: ${missingSkills.join(
          ', '
        )}. If you have this experience, make it easier to find in your resume.`
      );
    }

    if (!/\bprojects?\b/i.test(resumeText)) {
      suggestions.push(
        'Add relevant academic or personal projects. Explain what you built, the technologies used and the result.'
      );
    }

    if (!/\b(internship|experience|employment)\b/i.test(resumeText)) {
      suggestions.push(
        'If applicable, describe internships, practical training or other relevant experience.'
      );
    }

    if (matchedSkills.length) {
      suggestions.push(
        `Highlight your matching skills: ${matchedSkills.join(
          ', '
        )}. Support them with real project or experience examples.`
      );
    }

    if (
      !/\b(achieved|improved|developed|built|created|implemented|reduced|increased)\b/i.test(
        resumeText
      )
    ) {
      suggestions.push(
        'Use specific action verbs to explain your contributions, and include measurable results when you can verify them.'
      );
    }

    setAnalysis({
      score,
      resumeSkills,
      requiredSkills,
      matchedSkills,
      missingSkills,
      suggestions,
    });
  }

  function resetAnalysis() {
    setResumeText('');
    setJobDescription('');
    setAnalysis(null);
    setError('');
    setUploadedFileName('');
    setIsReadingFile(false);

    const fileInput = document.getElementById('resume-file');

    if (fileInput) {
      fileInput.value = '';
    }
  }

  return (
    <section className="jd-matcher-section" id="jd-matcher">
      <div className="jd-matcher-heading">
        <div>
          <p className="eyebrow">SMART CAREER TOOLS</p>
          <h2>Resume - JD Matcher</h2>
          <p className="panel-subtitle">
            Compare your resume with a job description and identify skill gaps.
          </p>
        </div>

        <span className="jd-matcher-icon" aria-hidden="true">
          ▤
        </span>
      </div>

      <form className="jd-matcher-form" onSubmit={analyzeMatch}>
        <div className="jd-input-grid">
          <div className="jd-field">
            <label htmlFor="jd-resume">Your resume text</label>

            <div className="jd-upload-control">
              <label htmlFor="resume-file">
                Upload resume (PDF or DOCX)
              </label>

              <input
                id="resume-file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleResumeUpload}
                disabled={isReadingFile}
              />

              {isReadingFile && (
                <p className="jd-field-hint">Reading your resume...</p>
              )}

              {!isReadingFile && uploadedFileName && (
                <p className="jd-field-hint">
                  Loaded: {uploadedFileName}
                </p>
              )}
            </div>

            <textarea
              id="jd-resume"
              value={resumeText}
              onChange={(event) => {
                setResumeText(event.target.value);
                setAnalysis(null);
              }}
              placeholder="Upload a PDF/DOCX file or paste your resume text here..."
              rows={10}
              required
            />

            <span className="jd-field-hint">
              {resumeCount} words · You can edit extracted text before analyzing.
            </span>
          </div>

          <div className="jd-field">
            <label htmlFor="jd-description">Job Description (JD)</label>

            <textarea
              id="jd-description"
              value={jobDescription}
              onChange={(event) => {
                setJobDescription(event.target.value);
                setAnalysis(null);
              }}
              placeholder="Paste the complete job description, including required skills and responsibilities..."
              rows={10}
              required
            />

            <span className="jd-field-hint">
              Include the full JD for a more useful comparison.
            </span>
          </div>
        </div>

        {error && (
          <p className="jd-error" role="alert">
            {error}
          </p>
        )}

        <div className="jd-form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={resetAnalysis}
          >
            Clear
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={!canAnalyze || isReadingFile}
          >
            Analyze match <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>

      {analysis && (
        <div className="jd-results" aria-live="polite">
          <div className="jd-score-card">
            <div
              className="jd-score-circle"
              style={{ '--jd-score-angle': `${analysis.score * 3.6}deg` }}
            >
              <div>
                <strong>{analysis.score}%</strong>
                <span>Skill match</span>
              </div>
            </div>

            <div className="jd-score-copy">
              <p className="eyebrow">YOUR MATCH REPORT</p>

              <h3>
                {analysis.score >= 75
                  ? 'Strong skill overlap'
                  : analysis.score >= 45
                    ? 'Some relevant skills found'
                    : 'Important skill gaps found'}
              </h3>

              <p>
                {analysis.matchedSkills.length} of{' '}
                {analysis.requiredSkills.length} identified job-skill
                categories were also found in your resume text.
              </p>

              <small>
                This is a keyword-based estimate, not a verified ATS score.
              </small>
            </div>
          </div>

          <div className="jd-skill-grid">
            <article className="jd-skill-card">
              <h3>
                Matching skills
                <span className="jd-count">
                  {analysis.matchedSkills.length}
                </span>
              </h3>

              {analysis.matchedSkills.length ? (
                <div className="jd-chips">
                  {analysis.matchedSkills.map((skill) => (
                    <span className="jd-chip jd-chip-match" key={skill}>
                      ✓ {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p>No matching skills from the supported list were found.</p>
              )}
            </article>

            <article className="jd-skill-card">
              <h3>
                Skills to review
                <span className="jd-count">
                  {analysis.missingSkills.length}
                </span>
              </h3>

              {analysis.missingSkills.length ? (
                <div className="jd-chips">
                  {analysis.missingSkills.map((skill) => (
                    <span className="jd-chip jd-chip-missing" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p>
                  All identified JD skills were found in your resume text.
                </p>
              )}

              <p className="jd-small-note">
                A missing keyword does not prove you lack that skill. Include
                it only if it reflects your actual experience.
              </p>
            </article>
          </div>

          <article className="jd-suggestions-card">
            <h3>Resume improvement suggestions</h3>

            {analysis.suggestions.length ? (
              <ul className="jd-suggestions-list">
                {analysis.suggestions.map((suggestion, index) => (
                  <li key={index}>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Review your resume for clear evidence of your achievements and
                relevant experience.
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}