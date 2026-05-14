let gameData = null;
let currentQuestion = null;
let answeredQuestions = new Set();
let ws = null;
let roomCode = null;
let buzzQueue = [];
let currentRewardValue = null; // Track current reward value during explanation rounds

const TEAMS = [
  { id: 0, name: 'Team Red', color: '#ff4444', score: 0, streak: 0, players: [] },
  { id: 1, name: 'Team Blue', color: '#4444ff', score: 0, streak: 0, players: [] },
  { id: 2, name: 'Team Green', color: '#44ff44', score: 0, streak: 0, players: [] },
  { id: 3, name: 'Team Yellow', color: '#ffff44', score: 0, streak: 0, players: [] },
  { id: 4, name: 'Team Purple', color: '#ff44ff', score: 0, streak: 0, players: [] },
  { id: 5, name: 'Team Orange', color: '#ff8844', score: 0, streak: 0, players: [] }
];

let answeringTeam = null;
let explanationMode = false;
let wrongTeamId = null;

const STREAK_THRESHOLDS = [3, 5, 7];
const STREAK_BONUS_POINTS = { 3: 100, 5: 250, 7: 500 };

document.addEventListener('DOMContentLoaded', () => {
  loadGame();
  setupModalListeners();
  setupExplanationModalListeners();
  setupWebSocket();
  addBuzzerQueueDisplay();
});

async function loadGame() {
  try {
    const response = await fetch('/api/game');
    gameData = await response.json();
    renderTeams();
    renderBoard();
  } catch (error) {
    console.error('Failed to load game:', error);
  }
}

function renderTeams() {
  const scoreBoard = document.getElementById('score-board');
  scoreBoard.innerHTML = '';
  
  // Only render teams that have at least one player
  const activeTeams = TEAMS.filter(team => team.players.length > 0);
  
  if (activeTeams.length === 0) {
    // Show placeholder message when no teams have joined yet
    scoreBoard.innerHTML = '<div class="no-teams-message">Waiting for teams to join...</div>';
    return;
  }
  
  activeTeams.forEach(team => {
    const teamDiv = document.createElement('div');
    teamDiv.className = 'team';
    teamDiv.style.borderColor = team.color;
    
    teamDiv.innerHTML = `
      <div class="team-header">
        <span class="team-name" style="color: ${team.color}">${team.name}</span>
        <span class="team-score" id="team-score-${team.id}" style="color: ${team.score >= 0 ? '#00ff00' : '#ff4444'}">$${team.score}</span>
      </div>
      <div class="team-stats">
        <span class="streak">Streak: <span id="team-streak-${team.id}">${team.streak}</span></span>
      </div>
      <div class="team-actions">
        <button class="kick-btn" onclick="kickTeam(${team.id})" title="Remove team to rejoin with new name">Kick Team</button>
      </div>
    `;
    scoreBoard.appendChild(teamDiv);
  });
}

function updateTeamDisplay(teamId) {
  const team = TEAMS[teamId];
  document.getElementById(`team-score-${teamId}`).textContent = `$${team.score}`;
  document.getElementById(`team-score-${teamId}`).style.color = team.score >= 0 ? '#00ff00' : '#ff4444';
  document.getElementById(`team-streak-${teamId}`).textContent = team.streak;
}

function renderBoard() {
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  
  gameData.categories.forEach((category, catIndex) => {
    const header = document.createElement('div');
    header.className = 'category-header';
    header.textContent = category.name;
    board.appendChild(header);
  });
  
  for (let row = 0; row < 5; row++) {
    gameData.categories.forEach((category, catIndex) => {
      const cell = document.createElement('div');
      const questionId = `${catIndex}-${row}`;
      cell.className = 'question-cell';
      cell.dataset.category = catIndex;
      cell.dataset.question = row;
      cell.dataset.questionId = questionId;
      
      if (answeredQuestions.has(questionId)) {
        cell.classList.add('answered');
        cell.textContent = 'USED';
      } else {
        cell.textContent = `$${category.questions[row].value}`;
        cell.addEventListener('click', () => openQuestion(catIndex, row));
      }
      
      board.appendChild(cell);
    });
  }
}

// First openQuestion definition (used during initial setup)
function openQuestion(categoryIndex, questionIndex) {
  const category = gameData.categories[categoryIndex];
  currentQuestion = {
    ...category.questions[questionIndex],
    category: category.name,
    categoryIndex,
    questionIndex,
    questionId: `${categoryIndex}-${questionIndex}`
  };
  
  document.getElementById('modal-category').textContent = category.name;
  document.getElementById('modal-value').textContent = `$${currentQuestion.value}`;
  document.getElementById('modal-question').textContent = currentQuestion.question;
  // Handle array or string format for answers - show only first answer
  const answers = Array.isArray(currentQuestion.answer) ? currentQuestion.answer : [currentQuestion.answer];
  document.getElementById('modal-answer').textContent = answers[0] || '';
  
  // Reset answering team and check buzz queue
  answeringTeam = null;
  const teamSelection = document.getElementById('team-selection');
  
  if (buzzQueue.length > 0) {
    selectAnsweringTeam(buzzQueue[0].team);
  } else {
    teamSelection.classList.remove('hidden');
    teamSelection.innerHTML = '<h3>Waiting for buzz...</h3>';
    document.getElementById('show-answer-btn').classList.add('hidden');
  }
  
  document.getElementById('answer-section').classList.add('hidden');
  document.getElementById('close-btn').classList.add('hidden');
  
  // Reset modal state before opening
  document.getElementById('question-modal').classList.remove('hidden', 'fade-out');
}

function selectAnsweringTeam(teamId) {
  answeringTeam = TEAMS[teamId];
  document.getElementById('team-selection').classList.add('hidden');
  document.getElementById('show-answer-btn').classList.remove('hidden');
  document.querySelector('.modal-content').dataset.answeringTeam = teamId;
}

function setupModalListeners() {
  document.getElementById('show-answer-btn').addEventListener('click', () => {
    document.getElementById('answer-section').classList.remove('hidden');
    document.getElementById('verification-buttons').classList.remove('hidden');
    document.getElementById('show-answer-btn').classList.add('hidden');
  });
  
  document.getElementById('mark-correct-btn').addEventListener('click', () => {
    handleCorrectAnswer();
    markQuestionAnswered();
    closeModal();
    
    // Send verification to server with questionIndex for attempt tracking
    if (currentQuestion && currentQuestion.questionIndex !== undefined) {
      fetch('/api/verify-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: answeringTeam.id,
          player: 'teacher',
          questionValue: currentQuestion.value,
          isCorrect: true,
          questionIndex: currentQuestion.questionIndex
        })
      });
    }
  });
  
  document.getElementById('mark-wrong-btn').addEventListener('click', () => {
    handleWrongAnswer();
    
    // Open explanation modal for other teams to buzz in
    openExplanationModal();
    
    // Send verification to server with questionIndex for attempt tracking
    if (currentQuestion && currentQuestion.questionIndex !== undefined) {
      fetch('/api/verify-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: answeringTeam.id,
          player: 'teacher',
          questionValue: currentQuestion.value,
          isCorrect: false,
          questionIndex: currentQuestion.questionIndex
        })
      });
    }
  });
  
  document.getElementById('close-btn').addEventListener('click', closeModal);
  
  document.getElementById('question-modal').addEventListener('click', (e) => {
    if (e.target.id === 'question-modal') {
      closeModal();
    }
  });
}

function handleCorrectAnswer() {
  if (!answeringTeam) return;
  
  let points = currentQuestion.value;
  let message = '';
  
  answeringTeam.score += points;
  answeringTeam.streak++;
  
  const bonus = checkStreakBonus(answeringTeam);
  if (bonus > 0) {
    message += ` +$${bonus} streak bonus!`;
  }
  
  updateTeamDisplay(answeringTeam.id);
  showFeedback(`${answeringTeam.name} +$${points}${message}`, answeringTeam.color);
  sendTeamState();
  resetOtherStreaks(answeringTeam.id);
}

function handleWrongAnswer() {
  if (!answeringTeam) return;
  
  answeringTeam.score -= currentQuestion.value;
  answeringTeam.streak = 0;
  
  updateTeamDisplay(answeringTeam.id);
  showFeedback(`${answeringTeam.name} -$${currentQuestion.value}`, '#ff4444');
  sendTeamState();
}

function checkStreakBonus(team) {
  let bonus = 0;
  if (STREAK_THRESHOLDS.includes(team.streak)) {
    bonus = STREAK_BONUS_POINTS[team.streak];
    team.score += bonus;
  }
  return bonus;
}

function sendTeamState() {
  if (ws?.readyState === WebSocket.OPEN) {
    const teamsPayload = TEAMS.map(t => ({ id: t.id, score: t.score, streak: t.streak }));
    ws.send(JSON.stringify({ type: 'team-state', teams: teamsPayload }));
  }
}

function showNotification(className, html, duration = 3000) {
  const notif = document.createElement('div');
  notif.className = className;
  notif.innerHTML = html;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), duration);
}

function resetOtherStreaks(winnerId) {
  let updated = false;
  TEAMS.forEach(team => {
    if (team.id !== winnerId && team.streak !== 0) {
      team.streak = 0;
      updateTeamDisplay(team.id);
      updated = true;
    }
  });
  if (updated) sendTeamState();
}

function showFeedback(text, color) {
  const feedback = document.createElement('div');
  feedback.className = 'score-feedback';
  feedback.style.color = color;
  feedback.textContent = text;
  document.body.appendChild(feedback);
  setTimeout(() => feedback.remove(), 2500);
}

function markQuestionAnswered() {
  answeredQuestions.add(currentQuestion.questionId);
  renderBoard();
  checkGameComplete();
}

function closeModal() {
  const modal = document.getElementById('question-modal');
  
  // Add fade-out class for smooth transition
  modal.classList.add('fade-out');
  
  // Allow transition to complete before hiding and resetting state
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('fade-out');
    
    document.querySelector('.modal-content').dataset.answeringTeam = '';
    currentQuestion = null;
    answeringTeam = null;
    
    // Clear local buzz queue immediately to ensure fresh start
    buzzQueue = [];
    updateBuzzQueue([]);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'question-close' }));
    }
  }, 200);
}

function checkGameComplete() {
  const totalQuestions = gameData.categories.length * 5;
  if (answeredQuestions.size === totalQuestions) {
    setTimeout(() => {
      const winner = TEAMS.reduce((max, team) => team.score > max.score ? team : max, TEAMS[0]);
      const scores = TEAMS.map(t => `${t.name}: $${t.score}`).join('\n');
      alert(`Game Over!\n\n${scores}\n\nWinner: ${winner.name}!`);
    }, 300);
  }
}

function setupWebSocket() {
  // Use relative WebSocket URL for same-origin connection
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${protocol}//${location.host}`;
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const existingRoom = urlParams.get('room');
    
    ws.send(JSON.stringify({
      type: 'teacher-join',
      roomCode: 'GAME'
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWSMessage(data);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    setTimeout(setupWebSocket, 3000);
  };
}

const WS_HANDLERS = {
  'join-success': (data) => { roomCode = data.roomCode; },
  'player-joined': (data) => addPlayerToTeam(data.name, data.team),
  'player-left': (data) => removePlayerFromTeam(data.name, data.team),
  'team-cleared': (data) => clearTeamDisplay(data.team),
  'buzz-queue': (data) => updateBuzzQueue(data.queue),
  'buzz-accepted': (data) => showBuzzNotification(data),
  'answer-verified': (data) => handleAnswerVerified(data),
  'answer-graded': (data) => handleAnswerGraded(data),
  'question-max-attempts': (data) => handleMaxAttemptsReached(data),
  'explanation-buzz': (data) => updateExplanationBuzz(data),
  'explanation-started': (data) => handleExplanationStarted(data),
  'explanation-end': (data) => handleExplanationEnd(data)
};

function handleWSMessage(data) {
  WS_HANDLERS[data.type]?.(data);
}

function displayRoomCode(code) {
  const header = document.querySelector('header h1');
  const roomDisplay = document.createElement('div');
  roomDisplay.className = 'room-code-display';
  roomDisplay.innerHTML = `
    <span class="room-label">Room Code:</span>
    <span class="room-code">${code}</span>
  `;
  header.insertAdjacentElement('afterend', roomDisplay);
}

function addPlayerToTeam(name, teamId) {
  TEAMS[teamId].players.push(name);
  // Update team name to show actual player names
  if (TEAMS[teamId].players.length === 1) {
    // First player - set team name to their name
    TEAMS[teamId].name = name;
  } else {
    // Multiple players - join all names
    TEAMS[teamId].name = TEAMS[teamId].players.join(', ');
  }
  renderTeams(); // Re-render all teams to update names
}

function removePlayerFromTeam(name, teamId) {
  TEAMS[teamId].players = TEAMS[teamId].players.filter(playerName => playerName !== name);
  // Update team name
  if (TEAMS[teamId].players.length === 0) {
    // No players left - revert to default team name
    const defaultNames = ['Team Red', 'Team Blue', 'Team Green', 'Team Yellow', 'Team Purple', 'Team Orange'];
    TEAMS[teamId].name = defaultNames[teamId];
  } else {
    // Still players left - update to show remaining names
    TEAMS[teamId].name = TEAMS[teamId].players.join(', ');
  }
  renderTeams(); // Re-render all teams to update names
}

function clearTeamDisplay(teamId) {
  // Clear all players from the team and reset to default name
  TEAMS[teamId].players = [];
  const defaultNames = ['Team Red', 'Team Blue', 'Team Green', 'Team Yellow', 'Team Purple', 'Team Orange'];
  TEAMS[teamId].name = defaultNames[teamId];
  renderTeams(); // Re-render all teams to update display
}

function addBuzzerQueueDisplay() {
  const container = document.querySelector('.container');
  const buzzerPanel = document.createElement('div');
  buzzerPanel.id = 'buzzer-panel';
  buzzerPanel.className = 'buzzer-panel hidden';
  buzzerPanel.innerHTML = `
    <h3>Buzzer Queue</h3>
    <div id="buzzer-queue" class="buzzer-queue"></div>
  `;
  container.insertBefore(buzzerPanel, document.querySelector('main'));
}

function updateBuzzQueue(queue) {
  buzzQueue = queue;
  const buzzerPanel = document.getElementById('buzzer-panel');
  const buzzerQueue = document.getElementById('buzzer-queue');
  const modal = document.getElementById('question-modal');
  
  if (queue.length === 0) {
    buzzerPanel.classList.add('hidden');
    return;
  }
  
  buzzerPanel.classList.remove('hidden');
  
  // Auto-select first team if question is open and no team selected yet
  if (!modal.classList.contains('hidden') && !answeringTeam && queue.length > 0) {
    selectAnsweringTeam(queue[0].team);
  }
  
  buzzerQueue.innerHTML = queue.map((buzz, index) => `
    <div class="buzz-item ${index === 0 ? 'first' : ''}" data-team="${buzz.team}">
      <span class="buzz-position">${index + 1}</span>
      <span class="buzz-team" style="color: ${TEAMS[buzz.team].color}">${TEAMS[buzz.team].name}</span>
      <span class="buzz-player">${buzz.player}</span>
    </div>
  `).join('');
}

function showBuzzNotification(data) {
  if (data.position === 1) {
    showNotification('buzz-notification', `
      <div class="buzz-alert">${TEAMS[data.team].name} buzzed in!</div>
      <div class="buzz-player-name">${data.player}</div>
    `);
  }
}

// Second openQuestion definition (overrides first, used after WebSocket is connected)
function openQuestion(categoryIndex, questionIndex) {
  const category = gameData.categories[categoryIndex];
  currentQuestion = {
    ...category.questions[questionIndex],
    category: category.name,
    categoryIndex,
    questionIndex,
    questionId: `${categoryIndex}-${questionIndex}`
  };
  
  document.getElementById('modal-category').textContent = category.name;
  document.getElementById('modal-value').textContent = `$${currentQuestion.value}`;
  document.getElementById('modal-question').textContent = currentQuestion.question;
  // Handle array or string format for answers - show only first answer
  const answers = Array.isArray(currentQuestion.answer) ? currentQuestion.answer : [currentQuestion.answer];
  document.getElementById('modal-answer').textContent = answers[0] || '';
  
  // Wait for buzzes or auto-select if queue has entries
  if (buzzQueue.length > 0) {
    selectAnsweringTeam(buzzQueue[0].team);
  } else {
    document.getElementById('team-selection').classList.remove('hidden');
    document.getElementById('team-selection').innerHTML = '<h3>Waiting for buzz...</h3>';
    document.getElementById('show-answer-btn').classList.add('hidden');
  }
  
  document.getElementById('answer-section').classList.add('hidden');
  document.getElementById('close-btn').classList.add('hidden');
  
  // Reset modal state before opening
  document.getElementById('question-modal').classList.remove('hidden', 'fade-out');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'question-open', 
      questionValue: currentQuestion.value,
      correctAnswer: currentQuestion.answer 
    }));
  }
}

function handleAnswerVerified(data) {
  // Show answer section so teacher can manually grade
  document.getElementById('answer-section').classList.remove('hidden');
  document.getElementById('show-answer-btn').classList.add('hidden');
  
  // Show transcript for teacher review
  const answerSection = document.getElementById('answer-section');
  answerSection.innerHTML = `
    <h4>Student Answer</h4>
    <p><strong>Player:</strong> ${data.player}</p>
    <p><strong>Response:</strong> ${data.transcript}</p>
  `;
}

// Explanation Modal Functions
function openExplanationModal() {
  explanationMode = true;
  wrongTeamId = answeringTeam?.id;
  
  // Calculate reward value - halve the original question value
  currentRewardValue = Math.floor(currentQuestion.value / 2);
  
  // Populate the explanation modal with question info
  document.getElementById('explanation-wrong-team').textContent = answeringTeam?.name || 'Unknown';
  document.getElementById('explanation-question').textContent = currentQuestion?.question || '';
  const answers = Array.isArray(currentQuestion?.answer) ? currentQuestion.answer : [currentQuestion?.answer];
  document.getElementById('explanation-answer').textContent = answers[0] || '';
  document.getElementById('explanation-reward-value').textContent = `$${currentRewardValue}`;
  
  // Reset buzz status display
  document.getElementById('explanation-buzz-status').innerHTML = '<h3>Waiting for buzz...</h3>';
  
  // Show explanation modal and hide question modal
  document.getElementById('question-modal').classList.add('hidden');
  document.getElementById('explanation-modal').classList.remove('hidden');
  
  // Notify server that explanation round has started
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'explanation-start',
      wrongTeamId: wrongTeamId,
      questionValue: currentQuestion?.value,
      currentRewardValue: currentRewardValue,
      categoryIndex: currentQuestion?.categoryIndex,
      questionIndex: currentQuestion?.questionIndex
    }));
  }
}

function closeExplanationModal() {
  explanationMode = false;
  wrongTeamId = null;
  
  document.getElementById('explanation-modal').classList.add('hidden');
  closeModal();
  
  // Notify server that explanation round has ended
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'explanation-end' }));
  }
}

function updateExplanationBuzz(buzzData) {
  const statusDiv = document.getElementById('explanation-buzz-status');
  const team = TEAMS[buzzData.team];
  
  statusDiv.innerHTML = `
    <div class="explanation-buzz-item">
      <span class="explanation-buzz-team" style="color: ${team.color}">${team.name}</span>
      <span class="explanation-buzz-player">${buzzData.player} wants to explain!</span>
    </div>
  `;
}

function setupExplanationModalListeners() {
  document.getElementById('end-explanation-btn').addEventListener('click', () => {
    closeExplanationModal();
  });
}

function handleExplanationStarted(data) {
  // Explanation round has started - other teams can now buzz in
  console.log('Explanation round started - wrong team:', data.wrongTeamId);
}

function handleExplanationEnd(data) {
  // Explanation round has ended - reset reward value display
  currentRewardValue = null;
  console.log('Explanation round ended');
}

function handleAnswerGraded(data) {
  // Handle answer grading result from server
  console.log('Answer graded:', data);
  
  if (data.isCorrect) {
    // Use currentRewardValue for explanation rounds, otherwise use questionValue
    const points = data.currentRewardValue !== undefined && data.currentRewardValue !== null 
      ? data.currentRewardValue 
      : data.questionValue;
    showFeedback(`${TEAMS[data.team].name} +$${points}`, TEAMS[data.team].color);
  } else {
    // Wrong answer during explanation - update reward display
    if (data.currentRewardValue !== undefined && data.currentRewardValue !== null) {
      document.getElementById('explanation-reward-value').textContent = `$${data.currentRewardValue}`;
    }
    showFeedback(`${TEAMS[data.team].name} -$${data.questionValue}`, '#ff4444');
  }
}

function handleMaxAttemptsReached(data) {
  // Maximum attempts reached - question is now USED
  console.log('Max attempts reached:', data.message);
  if (currentQuestion && currentQuestion.questionId) {
    markQuestionAnswered();
  }
}

function kickTeam(teamId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'kick-team',
      teamId: teamId
    }));
  }
}
