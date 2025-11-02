/* quiz script (vanilla JS)
   - reads questions.json via fetch
   - displays one question at a time with 5 buttons (options)
   - click: check answer, +1 / -1, color feedback, wait 1s then next
   - records time per question and computes average (seconds)
*/

let questions = [];
let score = 0;
let times = [];
let current = 0;
let startTime = 0;
let answered = false;

// DOM element references will be (re)bound so they remain valid after we
// replace the quiz container's innerHTML when showing results. Use let so
// we can reassign them on "Chơi lại".
let qIndexEl;
let scoreEl;
let questionEl;
let buttonsEl;
let messageEl;

// keep the original innerHTML of #quiz so we can restore it on retry
let initialQuizHTML = null;
const STORAGE_KEY = 'quiz_questions_v1';

function computeAverageTime() {
  if (!times.length) return 0;
  return times.reduce((a,b)=>a+b,0) / times.length / 1000; // seconds
}

function sanitize(t){ return String(t ?? '').trim(); }

// bind or re-bind DOM elements after the page (re)renders the quiz container
function bindElements(){
  qIndexEl = document.getElementById('qIndex');
  scoreEl = document.getElementById('score');
  questionEl = document.getElementById('question');
  buttonsEl = document.getElementById('buttons');
  messageEl = document.getElementById('message');
  // management form elements (may be undefined if not present yet)
  window.addForm = document.getElementById('addForm');
  window.newQuestionEl = document.getElementById('newQuestion');
  window.optEls = [
    document.getElementById('opt0'),
    document.getElementById('opt1'),
    document.getElementById('opt2'),
    document.getElementById('opt3'),
    document.getElementById('opt4')
  ];
  window.correctSelect = document.getElementById('correctSelect');
  window.exportBtn = document.getElementById('exportBtn');
  window.submitBtn = document.getElementById('submitBtn');
  window.cancelEdit = document.getElementById('cancelEdit');
  window.questionList = document.getElementById('questionList');
  // editing index for edit mode (null = adding new)
  window.editingIndex = null;
  // update correctSelect labels to reflect current option inputs
  updateCorrectSelectOptions();
}

// update the text of the correctSelect to match option inputs (opt0..opt3)
function updateCorrectSelectOptions(){
  if (!window.correctSelect) return;
  // clear existing
  window.correctSelect.innerHTML = '';
  for (let i = 0; i < 4; i++){
    const text = (window.optEls && window.optEls[i] && window.optEls[i].value) ? sanitize(window.optEls[i].value) : `Option ${i+1}`;
    const opt = document.createElement('option');
    opt.value = String(i);
    const letters = ['A','B','C','D'];
    opt.textContent = `${letters[i]}: ${text || `Option ${i+1}`}`;
    window.correctSelect.appendChild(opt);
  }
}
async function loadQuestions(){
  try{
    // if user previously saved questions into localStorage, use them
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // normalize saved questions
            questions = (parsed || []).map((q, idx) => {
              const opts = Array.isArray(q.options) ? q.options.slice(0,5) : [];
              while (opts.length < 5) opts.push('');
              opts[4] = 'Next';
              let correct = sanitize(q.correct);
              if (!correct || correct === 'Next' || sanitize(correct) === sanitize(opts[4])) {
                correct = opts[0] || '';
              }
              return { question: sanitize(q.question), options: opts, correct };
            });
            startQuiz();
            return;
          }
      } catch (e) {
        console.warn('Invalid saved questions in localStorage, ignoring');
      }
    }

    const res = await fetch('questions.json', {cache: 'no-store'});
    if(!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0) throw new Error('No questions');
    // normalize fetched questions: ensure option 5 == 'Next' and correct != 'Next'
    questions = (data || []).map((q, idx) => {
      const opts = Array.isArray(q.options) ? q.options.slice(0,5) : [];
      while (opts.length < 5) opts.push('');
      opts[4] = 'Next';
      let correct = sanitize(q.correct);
      if (!correct || correct === 'Next' || sanitize(correct) === sanitize(opts[4])) {
        correct = opts[0] || '';
      }
      return { question: sanitize(q.question), options: opts, correct };
    });
    startQuiz();
  }catch(err){
    console.error(err);
    messageEl.innerHTML = 'Lỗi khi tải câu hỏi. Nếu bạn mở file trực tiếp (file://), hãy chạy local server (VD: Live Server trong VS Code hoặc <code>python -m http.server</code>) để cho phép fetch.';
  }
}

function renderQuestion(){
  answered = false;
  const q = questions[current];
  // ensure option 5 is always Next at render time
  if (!Array.isArray(q.options)) q.options = [];
  while (q.options.length < 5) q.options.push('');
  q.options[4] = 'Next';
  qIndexEl.textContent = `Câu ${current+1}/${questions.length}`;
  scoreEl.textContent = `Điểm: ${score}`;
  questionEl.textContent = sanitize(q.question);
  buttonsEl.innerHTML = '';

  const opts = Array.isArray(q.options) ? q.options.slice(0,5) : [];
  while(opts.length < 5) opts.push('');

  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = opt || '(Không có)';
    if(!opt) btn.disabled = true;
    btn.addEventListener('click', ()=> handleAnswer(opt, btn));
    buttonsEl.appendChild(btn);
  });

  const firstBtn = buttonsEl.querySelector('button:not(:disabled)');
  if(firstBtn) firstBtn.focus();
  startTime = performance.now();
  // ensure management handlers are attached (safe no-op if elements missing)
  attachManagementHandlers();
}

function handleAnswer(chosen, btnEl){
  if(answered) return;
  answered = true;
  const elapsed = performance.now() - startTime;
  times.push(elapsed);

  buttonsEl.querySelectorAll('button').forEach(b=>{ b.disabled = true; });

  const correct = sanitize(questions[current].correct);
  const chosenText = sanitize(chosen);
  // Special-case: if the option is "Next" treat as neutral (gray)
  // and do NOT change the score. This allows a skip/next button that
  // advances without penalty.
  if (chosenText.toLowerCase() === 'next') {
    btnEl.classList.add('neutral');
    // do not change score; do not highlight correct
  } else if (chosenText === correct) {
    btnEl.classList.add('correct');
    score += 1;
  } else {
    btnEl.classList.add('wrong');
    // highlight correct
    const right = Array.from(buttonsEl.querySelectorAll('button')).find(b => sanitize(b.textContent) === correct);
    if(right) right.classList.add('correct');
    score -= 1;
  }
  scoreEl.textContent = `Điểm: ${score}`;

  setTimeout(()=>{
    current++;
    if(current >= questions.length) showResults(); else renderQuestion();
  }, 1000);
}

function startQuiz(){
  score = 0; times = []; current = 0; messageEl.textContent = '';
  renderQuestion();
}

// handle adding new question from the UI
function handleAddQuestion(e){
  if (e && e.preventDefault) e.preventDefault();
  const qText = newQuestionEl ? sanitize(newQuestionEl.value) : '';
  const opts = (optEls || []).map(el => el ? sanitize(el.value) : '').slice(0,5);
  // force option 5 to 'Next' and require the first 4 options filled
  opts[4] = 'Next';
  const allFilled = opts.slice(0,4).every(o => o.length > 0);
  if (!qText) { addMessage('Câu hỏi trống'); return; }
  if (!allFilled) { addMessage('Vui lòng nhập đủ 4 lựa chọn (Option 1-4)'); return; }
  const ci = correctSelect ? parseInt(correctSelect.value,10) : 0;
  const ciClamped = Math.max(0, Math.min(3, ci)); // only 0..3 allowed
  const newQ = { question: qText, options: opts, correct: opts[ciClamped] };
  // if editingIndex is set, replace existing question
  if (typeof window.editingIndex === 'number' && window.editingIndex !== null) {
    questions[window.editingIndex] = newQ;
  } else {
    questions.push(newQ);
  }
  // persist to localStorage so added questions survive reloads
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
    addMessage((typeof window.editingIndex === 'number' && window.editingIndex !== null) ? 'Đã cập nhật câu hỏi.' : 'Đã thêm câu hỏi và lưu vào trình duyệt (localStorage). Tổng câu: ' + questions.length);
  } catch (err) {
    console.error('Lưu localStorage thất bại', err);
    addMessage('Đã thêm câu hỏi nhưng không lưu được (localStorage thất bại)');
  }
  // update index display if quiz in progress
  if (qIndexEl) qIndexEl.textContent = `Câu ${Math.min(current+1, questions.length)}/${questions.length}`;
  // clear form
  if (newQuestionEl) newQuestionEl.value = '';
  if (optEls) optEls.forEach((el,i)=>{ if(el) el.value = i===4 ? 'Next' : ''; });
  // refresh the correctSelect labels after clearing
  updateCorrectSelectOptions();
  // reset edit mode
  if (window.submitBtn) window.submitBtn.textContent = 'Thêm câu hỏi';
  if (window.cancelEdit) window.cancelEdit.style.display = 'none';
  window.editingIndex = null;
  renderQuestionList();
}

function addMessage(txt){
  const el = document.getElementById('addMessage');
  if (el) el.textContent = txt;
}

// render admin list of questions with edit/delete buttons
function renderQuestionList(){
  if (!window.questionList) return;
  window.questionList.innerHTML = '';
  if (!Array.isArray(questions) || questions.length === 0) {
    window.questionList.textContent = 'Chưa có câu hỏi.';
    return;
  }
  questions.forEach((q, idx) => {
    const div = document.createElement('div');
    div.style.borderBottom = '1px solid #eee';
    div.style.padding = '6px 0';
    const short = document.createElement('div');
    short.textContent = `${idx+1}. ${q.question}`;
    const actions = document.createElement('div');
    actions.style.marginTop = '6px';
    actions.innerHTML = `
      <button data-idx="${idx}" class="btn small editBtn">Sửa</button>
      <button data-idx="${idx}" class="btn small" style="margin-left:8px">Xoá</button>
    `;
    div.appendChild(short);
    div.appendChild(actions);
    window.questionList.appendChild(div);
  });

  // attach handlers
  Array.from(window.questionList.querySelectorAll('button')).forEach(b=>{
    const idx = parseInt(b.dataset.idx,10);
    if (b.textContent.trim() === 'Sửa') b.addEventListener('click', ()=> handleEditQuestion(idx));
    else b.addEventListener('click', ()=> handleDeleteQuestion(idx));
  });
}

function handleEditQuestion(idx){
  const q = questions[idx];
  if (!q) return;
  if (newQuestionEl) newQuestionEl.value = q.question;
  if (optEls) {
    for (let i=0;i<4;i++){ if (optEls[i]) optEls[i].value = q.options[i] || ''; }
    if (optEls[4]) optEls[4].value = 'Next';
  }
  updateCorrectSelectOptions();
  // set the select value to the index matching q.correct
  const ci = (q.options && q.options.indexOf(q.correct));
  if (window.correctSelect && ci >=0 && ci < 4) window.correctSelect.value = String(ci);
  window.editingIndex = idx;
  if (window.submitBtn) window.submitBtn.textContent = 'Lưu thay đổi';
  if (window.cancelEdit) window.cancelEdit.style.display = '';
}

function handleDeleteQuestion(idx){
  if (!confirm('Xác nhận xoá câu hỏi #' + (idx+1) + '?')) return;
  questions.splice(idx,1);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(questions)); } catch(e){}
  renderQuestionList();
  addMessage('Đã xoá câu hỏi. Tổng câu: ' + questions.length);
}

function handleCancelEdit(){
  window.editingIndex = null;
  if (newQuestionEl) newQuestionEl.value = '';
  if (optEls) optEls.forEach((el,i)=>{ if(el) el.value = i===4 ? 'Next' : ''; });
  updateCorrectSelectOptions();
  if (window.submitBtn) window.submitBtn.textContent = 'Thêm câu hỏi';
  if (window.cancelEdit) window.cancelEdit.style.display = 'none';
}

function downloadQuestions(){
  try{
    const data = JSON.stringify(questions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'questions.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    addMessage('Đã xuất file questions.json');
  }catch(err){
    addMessage('Xuất file thất bại');
    console.error(err);
  }
}

function showResults(){
  const avg = computeAverageTime();
  const html = `\n    <div class="results center">\n      <h2>Kết thúc</h2>\n      <p class="small">Tổng điểm: <strong>${score}</strong></p>\n      <p class="small">Thời gian trung bình / câu: <strong>${avg.toFixed(2)}</strong> giây</p>\n      <p class="small">Tổng câu: ${questions.length}</p>\n      <div style="margin-top:10px">\n        <button id="retry" class="btn">Chơi lại</button>\n      </div>\n    </div>\n  `;

  // Replace the quiz container with results. We saved the original HTML at
  // startup so we can restore it when the user retries.
  const quizContainer = document.getElementById('quiz');
  quizContainer.innerHTML = html;
  document.getElementById('qIndex').textContent = `Câu ${questions.length}/${questions.length}`;
  document.getElementById('score').textContent = `Điểm: ${score}`;

  // retry: restore original quiz HTML and re-bind elements
  document.getElementById('retry').addEventListener('click', () => {
    if (initialQuizHTML !== null) {
      quizContainer.innerHTML = initialQuizHTML;
      bindElements();
      startQuiz();
    } else {
      // fallback: full reload
      location.reload();
    }
  });

  // removed download-times feature as requested
}

window.addEventListener('DOMContentLoaded', () => {
  // initial bind of elements and save the original quiz HTML so we can
  // restore it later when the user clicks "Chơi lại".
  bindElements();
  const quizContainer = document.getElementById('quiz');
  if (quizContainer) initialQuizHTML = quizContainer.innerHTML;
  loadQuestions();
});

// attach handlers for management UI (if present). We call this after bindElements
// so DOM refs exist.
function attachManagementHandlers(){
  if (window.addForm) {
    window.addForm.removeEventListener('submit', handleAddQuestion);
    window.addForm.addEventListener('submit', handleAddQuestion);
  }
  if (window.exportBtn) {
    window.exportBtn.removeEventListener('click', downloadQuestions);
    window.exportBtn.addEventListener('click', downloadQuestions);
  }
  const clearBtn = document.getElementById('clearSaved');
  if (clearBtn) {
    clearBtn.removeEventListener('click', clearSavedQuestions);
    clearBtn.addEventListener('click', clearSavedQuestions);
  }
  // Attach input listeners to option inputs so the correctSelect shows actual text
  if (window.optEls && window.correctSelect) {
    for (let i = 0; i < 4; i++) {
      const el = window.optEls[i];
      if (!el) continue;
      // avoid attaching multiple listeners
      if (!el.dataset._listenerAttached) {
        el.addEventListener('input', () => {
          updateCorrectSelectOptions();
        });
        el.dataset._listenerAttached = '1';
      }
    }
  }
  // attach cancel edit
  if (window.cancelEdit) {
    window.cancelEdit.removeEventListener('click', handleCancelEdit);
    window.cancelEdit.addEventListener('click', handleCancelEdit);
  }
  // initial render of question list
  renderQuestionList();
}

// clear saved questions from localStorage and reload questions from file
function clearSavedQuestions(){
  localStorage.removeItem(STORAGE_KEY);
  addMessage('Đã xoá dữ liệu lưu trữ. Tải lại câu hỏi từ file questions.json...');
  // re-fetch original questions.json
  loadQuestions();
}