// Configuration - Use relative WebSocket URL for same-origin connection
const getWsUrl = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}`;
};

const WS_URL = getWsUrl();
const DEFAULT_ROOM = 'GAME';

let ws = null;
let currentState = 'waiting';
let myTeam = null;
let myName = '';
let myTeamScore = 0;

let currentQuestionValue = 0;

// Define message handlers before they can be called
const MSG_HANDLERS = {
  'join-success': (data) => { myTeam = data.team; showGameScreen(data); },
  'join-error': (data) => showError(data.message),
  'question-open': (data) => enableBuzzing(data),
  'buzz-accepted': (data) => data.player === myName ? showWaitingForAnswer() : lockoutBuzzer(),
  'question-close': () => { resetBuzzer(); },
  'team-state': (data) => updateTeamState(data.teams),
  'answer-verified': () => console.log('Waiting for teacher to grade...'),
  'answer-graded': handleAnswerGraded,
  'question-max-attempts': () => console.log('Maximum attempts reached - question is now USED'),
  'kicked': handleKicked,
  'explanation-start': handleExplanationStart,
  'explanation-end': handleExplanationEnd
};

function handleMessage(data) {
  MSG_HANDLERS[data.type]?.(data);
}

document.addEventListener('DOMContentLoaded', () => {
  setupJoinScreen();
});

function setupJoinScreen() {
  document.getElementById('join-btn').addEventListener('click', joinGame);
  document.getElementById('team-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });
  
  // Add buzzer event listener
  const buzzer = document.getElementById('buzzer');
  if (buzzer) {
    buzzer.addEventListener('click', buzzIn);
  }
}

function joinGame() {
  myName = document.getElementById('team-name').value.trim();
  if (!myName) {
    showError('Please enter your name');
    return;
  }
  connectWebSocket(DEFAULT_ROOM, myName);
}

function showError(msg) {
  const errorDiv = document.getElementById('join-error');
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
}

function connectWebSocket(roomCode, name) {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', roomCode, name }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', event.data, e);
    }
  };

  ws.onclose = () => {
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-status').classList.remove('connected');
    document.getElementById('connection-status').classList.add('disconnected');
  };

  ws.onerror = () => {
    showError('Connection failed. Please try again.');
  };
}

function showGameScreen(data) {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  
  const teamColors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
  document.getElementById('player-info').textContent = `${myName} (${teamColors[myTeam]})`;
  document.getElementById('connection-status').classList.add('connected');
  updateScoreDisplay();
}

function setState(state) {
  const states = ['waiting-state', 'buzzing-state', 'lockedout-state'];
  states.forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(state).classList.remove('hidden');
}

function enableBuzzing() {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.remove('locked', 'buzzed');
  buzzer.disabled = false;
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZ!';
  setState('buzzing-state');
}

function buzzIn() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({
    type: 'buzz',
    team: myTeam,
    player: myName
  }));
  
  document.getElementById('buzzer').disabled = true;
}

function showWaitingForAnswer() {
  console.log('Waiting for teacher to input answer...');
  
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.add('buzzed');
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZED!';
  
  // Show waiting state
  setState('waiting-state');
}


function lockoutBuzzer(isExplanation = false) {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.add('locked');
  buzzer.disabled = true;
  
  // Show locked out state with appropriate message
  setState('lockedout-state');
  const lockedText = document.querySelector('#lockedout-state .locked-text');
  if (lockedText) {
    lockedText.textContent = isExplanation ? 'Someone buzzed to explain!' : 'Someone buzzed first!';
  }
}

function handleExplanationStart(data) {
  console.log('[EXPLANATION START] Wrong team:', data.wrongTeamId);
  
  // Enable buzzing for teams other than the wrong team
  if (myTeam !== data.wrongTeamId) {
    enableBuzzing();
    const buzzer = document.getElementById('buzzer');
    buzzer.querySelector('.buzzer-text').textContent = 'BUZZ TO EXPLAIN!';
  } else {
    // Wrong team cannot buzz - show waiting state with message
    setState('waiting-state');
    const waitingText = document.querySelector('#waiting-state .waiting-text');
    if (waitingText) {
      waitingText.textContent = 'Waiting for explanation...';
    }
    const buzzer = document.getElementById('buzzer');
    buzzer.disabled = true;
  }
}

function handleExplanationEnd(data) {
  console.log('[EXPLANATION END]');
  
  // Reset buzzer state
  resetBuzzer();
}

function handleBuzzRejected(data) {
  console.log('Buzz rejected:', data.reason);
  const buzzer = document.getElementById('buzzer');
  buzzer.disabled = false;
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZ!';
  setState('buzzing-state');
}

function resetBuzzer() {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.remove('locked', 'buzzed');
  buzzer.disabled = false;
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZ!';
  setState('waiting-state');
}

function updateTeamState(teams) {
  const myTeamData = teams.find(t => t.id === myTeam);
  if (myTeamData) {
    myTeamScore = myTeamData.score || 0;
    updateScoreDisplay();
  }
}

function updateScoreDisplay() {
  const scoreEl = document.getElementById('team-score');
  scoreEl.textContent = `$${myTeamScore}`;
  scoreEl.style.color = myTeamScore >= 0 ? '#00ff00' : '#ff4444';
}
