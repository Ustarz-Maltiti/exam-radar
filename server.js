const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

const TOPICS = {
  'Entrepreneurship basics': ['define', 'definition', 'meaning of'],
  'Opportunities': ['opportunity', 'opportunities'],
  'Ideas and creativity': ['idea', 'ideas', 'creativity', 'brainstorm'],
  'Economic development': ['economic', 'development', 'employment'],
  'Value creation': ['value', 'marketplace', 'competitive']
};

function tagQuestion(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [topic, keywords] of Object.entries(TOPICS)) {
    if (keywords.some(k => lower.includes(k))) found.push(topic);
  }
  return found.length ? found : ['Uncategorised'];
}

function splitQuestions(text) {
  const lines = text.split('\n');
  const questions = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^SECTION/i.test(trimmed)) { current = null; continue; }

    const match = trimmed.match(/^(\d{1,2})[.)]\s+(.*)/);
    if (match) {
      current = { number: Number(match[1]), text: match[2] };
      questions.push(current);
    } else if (current && trimmed) {
      current.text += '\n' + trimmed;
    }
  }

  for (const q of questions) {
    const marks = [...q.text.matchAll(/\((\d+)\s*marks?\)/gi)];
    q.marks = marks.reduce((sum, m) => sum + Number(m[1]), 0);
    q.topics = tagQuestion(q.text);
  }
  return questions;
}

app.post('/upload', upload.single('paper'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const data = await pdf(req.file.buffer);
    res.json({ pages: data.numpages, text: data.text });
  } catch (err) {
    console.error('PDF error:', err.message);
    res.status(500).json({ error: 'Could not read that PDF' });
  }
});

app.post('/split', (req, res) => {
  res.json({ questions: splitQuestions(req.body.text || '') });
});
const DATA_FILE = 'papers.json';

let papers = [];
if (fs.existsSync(DATA_FILE)) {
  papers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function savePapers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(papers, null, 2));
};

app.post('/papers', (req, res) => {
  const { year, text } = req.body;
  const questions = splitQuestions(text || '');
  papers = papers.filter(p => p.year !== year);
  papers.push({ year, questions });
  savePapers();
  res.json({ questionCount: questions.length, totalPapers: papers.length });
});

app.get('/stats', (req, res) => {
  const tally = {};
  for (const paper of papers) {
    const seen = new Set();
    for (const q of paper.questions) {
      for (const topic of q.topics) {
        if (!tally[topic]) {
          tally[topic] = { topic, papersCount: 0, totalMarks: 0 };
        }
        tally[topic].totalMarks += q.marks;
        if (!seen.has(topic)) {
          tally[topic].papersCount++;
          seen.add(topic);
        }
      }
    }
  }
  const topics = Object.values(tally).sort(
    (a, b) => b.papersCount - a.papersCount || b.totalMarks - a.totalMarks
  );
  res.json({ totalPapers: papers.length, topics });
});
app.get('/papers', (req, res) => {
  res.json(papers);
});
app.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=exam-radar-export.json');
  res.json({
    source: 'Exam Radar',
    exportedAt: new Date().toISOString(),
    papers
  });
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});