(function () {
  'use strict';

  // ── Supabase config (fill in after Supabase setup) ─────────────────────────
  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

  // ── State ──────────────────────────────────────────────────────────────────
  let puzzle = null;
  let fortunes = [];
  let hintsUsed = 0;
  let solved = false;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let submittedName = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const states = {
    loading: $('state-loading'),
    error:   $('state-error'),
    puzzle:  $('state-puzzle'),
    success: $('state-success'),
  };

  // ── State management ───────────────────────────────────────────────────────
  function showState(name) {
    Object.values(states).forEach(el => el.classList.remove('active'));
    if (states[name]) states[name].classList.add('active');
  }

  function showError(msg) {
    $('error-message').textContent = msg;
    showState('error');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function normalise(str) {
    return str.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function nextIssueDay(dateStr) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay();
    let daysAhead;
    if (day === 1) daysAhead = 2;
    else if (day === 3) daysAhead = 2;
    else daysAhead = (8 - day) % 7 || 7;
    const next = new Date(dt.getTime() + daysAhead * 86400000);
    return days[next.getDay()];
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  function startTimer() {
    elapsedSeconds = 0;
    $('timer').textContent = '0:00';
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      $('timer').textContent = formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchJSON(path) {
    const r = await fetch(path + '?_=' + Date.now());
    if (!r.ok) throw new Error(`${r.status} fetching ${path}`);
    return r.json();
  }

  // ── Supabase helpers ───────────────────────────────────────────────────────
  function supabaseHeaders() {
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
  }

  async function submitSolve(name) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/solvers`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        puzzle_date: puzzle.date,
        solver_name: name,
        solve_time_seconds: elapsedSeconds,
        hints_used: hintsUsed,
      }),
    });
    if (!r.ok) throw new Error(`Supabase insert failed: ${r.status}`);
  }

  async function fetchLeaderboard() {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/solvers?puzzle_date=eq.${puzzle.date}&select=solver_name,solve_time_seconds,hints_used,completed_at&order=completed_at.asc&limit=100`,
      { headers: supabaseHeaders() }
    );
    if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
    return r.json();
  }

  // ── Render leaderboard ─────────────────────────────────────────────────────
  function renderLeaderboard(rows) {
    const fastest = [...rows].sort((a, b) => a.solve_time_seconds - b.solve_time_seconds).slice(0, 10);
    const first   = rows.slice(0, 10);

    renderList($('lb-fastest-list'), fastest, 'time');
    renderList($('lb-first-list'),   first,   'time');

    $('leaderboard-area').classList.remove('hidden');
  }

  function renderList(container, rows, _mode) {
    if (!rows.length) {
      container.innerHTML = '<p class="lb-empty">no entries yet</p>';
      return;
    }

    container.innerHTML = rows.map((row, i) => {
      const isMine = submittedName && row.solver_name === submittedName;
      const hintText = row.hints_used === 0 ? 'no hints' : row.hints_used === 1 ? '1 hint' : `${row.hints_used} hints`;
      return `
        <div class="lb-row">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name${isMine ? ' lb-mine' : ''}">${escHtml(row.solver_name)}</span>
          <span class="lb-time">${formatTime(row.solve_time_seconds)}</span>
          <span class="lb-hints">${hintText}</span>
        </div>`;
    }).join('');
  }

  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Leaderboard flow ───────────────────────────────────────────────────────
  async function showLeaderboard() {
    $('name-form-area').classList.add('hidden');
    const area = $('leaderboard-area');
    area.classList.remove('hidden');
    $('lb-fastest-list').innerHTML = '<p class="lb-empty">loading…</p>';
    $('lb-first-list').innerHTML   = '<p class="lb-empty">loading…</p>';

    try {
      const rows = await fetchLeaderboard();
      renderLeaderboard(rows);
    } catch {
      $('lb-fastest-list').innerHTML = '<p class="lb-error">leaderboard unavailable</p>';
      $('lb-first-list').innerHTML   = '<p class="lb-error">leaderboard unavailable</p>';
    }
  }

  // ── Render puzzle ──────────────────────────────────────────────────────────
  function renderPuzzle() {
    const typeLabels = { word: 'Word Puzzle', logic: 'Logic Puzzle', trivia: 'Trivia' };
    $('puzzle-type-badge').textContent = typeLabels[puzzle.puzzle_type] || puzzle.puzzle_type;
    $('puzzle-title').textContent = puzzle.title;
    $('flavor-text').textContent = puzzle.flavor_text;
    $('puzzle-question').textContent = puzzle.question;

    updateHintButton();
    startTimer();
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
    input.addEventListener('animationend', () => input.classList.remove('shake'), { once: true });
    input.select();
  }

  function handleCorrect() {
    solved = true;
    stopTimer();

    $('answer-reveal').textContent = puzzle.answer_display;
    $('solve-time-display').textContent = formatTime(elapsedSeconds);
    $('solution-explanation').textContent = puzzle.solution_explanation;

    const nextDay = nextIssueDay(puzzle.date);
    $('next-prompt').textContent = `next Disogi drops ${nextDay} — see you in your inbox`;

    // Pre-fill anonymous name
    $('name-input').value = `Anonymous#${Math.floor(1000 + Math.random() * 9000)}`;

    showState('success');
    setTimeout(() => showFortune(), 900);
  }

  // ── Name form events ───────────────────────────────────────────────────────
  $('name-submit-btn').addEventListener('click', async () => {
    const name = $('name-input').value.trim();
    if (!name) return;

    const btn = $('name-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Posting…';

    submittedName = name;

    try {
      await submitSolve(name);
    } catch {
      // Still show leaderboard even if insert failed
    }

    await showLeaderboard();
  });

  $('name-skip-btn').addEventListener('click', () => {
    showLeaderboard();
  });

  // ── Leaderboard tab switching ──────────────────────────────────────────────
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      $('lb-fastest').classList.toggle('hidden', which !== 'fastest');
      $('lb-first').classList.toggle('hidden',   which !== 'first');
    });
  });

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
    if (e.target === $('fortune-overlay')) $('fortune-overlay').classList.add('hidden');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('fortune-overlay').classList.add('hidden');
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');

    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      showError('No puzzle date in the URL. Use the link from your newsletter.');
      return;
    }

    let puzzlesData, fortunesData;
    try {
      [puzzlesData, fortunesData] = await Promise.all([
        fetchJSON('puzzles.json'),
        fetchJSON('fortunes.json').catch(() => ({ fortunes: [] })),
      ]);
    } catch {
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
