(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let puzzle = null;
  let fortunes = [];
  let hintsUsed = 0;
  let solved = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const states = {
    loading: $('state-loading'),
    error:   $('state-error'),
    puzzle:  $('state-puzzle'),
    success: $('state-success'),
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showState(name) {
    Object.values(states).forEach(el => el.classList.remove('active'));
    if (states[name]) states[name].classList.add('active');
  }

  function showError(msg) {
    $('error-message').textContent = msg;
    showState('error');
  }

  function normalise(str) {
    return str.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  }

  function dayName(dateStr) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const [y, m, d] = dateStr.split('-').map(Number);
    return days[new Date(y, m - 1, d).getDay()];
  }

  function nextIssueDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay(); // 0=Sun,1=Mon,3=Wed,5=Fri
    // Issue days: Mon(1), Wed(3), Fri(5)
    let daysAhead;
    if (day === 1) daysAhead = 2; // Mon → Wed
    else if (day === 3) daysAhead = 2; // Wed → Fri
    else daysAhead = (8 - day) % 7 || 7; // Fri → Mon, or any other day → next Mon
    const next = new Date(dt.getTime() + daysAhead * 86400000);
    return days[next.getDay()];
    function days(n) {
      return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n];
    }
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
  async function fetchJSON(path) {
    const r = await fetch(path + '?_=' + Date.now());
    if (!r.ok) throw new Error(`${r.status} fetching ${path}`);
    return r.json();
  }

  // ── Render puzzle ──────────────────────────────────────────────────────────
  function renderPuzzle() {
    const typeLabels = { word: 'Word Puzzle', logic: 'Logic Puzzle', trivia: 'Trivia' };
    $('puzzle-type-badge').textContent = typeLabels[puzzle.puzzle_type] || puzzle.puzzle_type;
    $('puzzle-title').textContent = puzzle.title;
    $('flavor-text').textContent = puzzle.flavor_text;
    $('puzzle-question').textContent = puzzle.question;

    // Hint button wording
    updateHintButton();

    showState('puzzle');
    $('answer-input').focus();
  }

  function updateHintButton() {
    const btn = $('hint-btn');
    const remaining = puzzle.hints.length - hintsUsed;
    if (remaining <= 0) {
      btn.textContent = 'No more hints';
      btn.disabled = true;
    } else {
      btn.textContent = hintsUsed === 0 ? 'Need a hint?' : 'Another hint?';
      btn.disabled = false;
    }
    $('hint-count').textContent = hintsUsed > 0
      ? `${hintsUsed} / ${puzzle.hints.length} hints used`
      : '';
  }

  // ── Hint logic ─────────────────────────────────────────────────────────────
  $('hint-btn').addEventListener('click', () => {
    if (hintsUsed >= puzzle.hints.length) return;
    const hint = puzzle.hints[hintsUsed];
    hintsUsed++;
    $('hint-display').textContent = hint;
    $('hint-display').classList.remove('hidden');
    updateHintButton();
  });

  // ── Answer checking ────────────────────────────────────────────────────────
  function checkAnswer() {
    if (solved) return;
    const raw = $('answer-input').value;
    if (!raw.trim()) return;

    if (normalise(raw) === normalise(puzzle.answer)) {
      handleCorrect();
    } else {
      handleWrong();
    }
  }

  $('submit-btn').addEventListener('click', checkAnswer);

  $('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAnswer();
  });

  function handleWrong() {
    const input = $('answer-input');
    $('wrong-feedback').classList.remove('hidden');
    input.classList.add('shake');
    input.addEventListener('animationend', () => {
      input.classList.remove('shake');
    }, { once: true });
    input.select();
  }

  function handleCorrect() {
    solved = true;
    $('answer-reveal').textContent = puzzle.answer_display;
    $('solution-explanation').textContent = puzzle.solution_explanation;

    const nextDay = nextIssueDay(puzzle.date);
    $('next-prompt').textContent = `next Disogi drops ${nextDay} — see you in your inbox`;

    showState('success');

    setTimeout(() => showFortune(), 900);
  }

  // ── Fortune modal ──────────────────────────────────────────────────────────
  function showFortune() {
    if (!fortunes.length) return;
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    $('fortune-text').textContent = fortune.text;
    $('fortune-overlay').classList.remove('hidden');
  }

  $('fortune-close').addEventListener('click', () => {
    $('fortune-overlay').classList.add('hidden');
  });

  $('fortune-overlay').addEventListener('click', e => {
    if (e.target === $('fortune-overlay')) {
      $('fortune-overlay').classList.add('hidden');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('fortune-overlay').classList.add('hidden');
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');

    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      showError('No puzzle date in the URL. Use the link from your newsletter.');
      return;
    }

    // Fetch puzzles and fortunes in parallel
    let puzzlesData, fortunesData;
    try {
      [puzzlesData, fortunesData] = await Promise.all([
        fetchJSON('puzzles.json'),
        fetchJSON('fortunes.json').catch(() => ({ fortunes: [] }))
      ]);
    } catch (err) {
      showError('Could not load puzzle data. Try refreshing.');
      return;
    }

    puzzle = (puzzlesData.puzzles || []).find(p => p.date === dateParam);
    if (!puzzle) {
      showError(`No puzzle found for ${dateParam}. Make sure you're using today's link.`);
      return;
    }

    fortunes = fortunesData.fortunes || [];

    renderPuzzle();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
