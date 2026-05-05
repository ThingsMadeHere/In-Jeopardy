// Configuration - Update this with your ngrok URL (e.g., 'wss://abc123.ngrok.io')
const WS_URL = 'wss://YOUR_NGROK_URL.ngrok.io';
let ws = null;
let currentState = 'waiting';
let myTeam = null;
let myName = '';
let myModifiers = [];
let myTeamScore = 0;

// Speech recognition
let recognition = null;
let currentQuestionValue = 0;
let isRecording = false;
let recordedTranscript = '';

document.addEventListener('DOMContentLoaded', () => {
  setupJoinScreen();
});

function setupJoinScreen() {
  document.getElementById('join-btn').addEventListener('click', joinGame);

  document.getElementById('room-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  document.getElementById('buzzer').addEventListener('click', buzzIn);
  document.getElementById('stop-recording-btn').addEventListener('click', stopRecordingAndSubmit);
}

function joinGame() {
  const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
  myName = document.getElementById('team-name').value.trim();

  if (!roomCode || !myName) {
    showError('Please enter room code and your name');
    return;
  }

  connectWebSocket(roomCode, myName);
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
    const data = JSON.parse(event.data);
    handleMessage(data);
  };

  ws.onclose = () => {
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-status').classList.remove('connected');
    document.getElementById('connection-status').classList.add('disconnected');
  };

  ws.onerror = (err) => {
    showError('Connection failed. Please try again.');
  };
}

const MSG_HANDLERS = {
  'join-success': (data) => { myTeam = data.team; showGameScreen(data); },
  'join-error': (data) => showError(data.message),
  'question-open': (data) => enableBuzzing(data),
  'buzz-accepted': (data) => data.player === myName ? startRecording(data) : lockoutBuzzer(),
  'question-close': () => { resetBuzzer(); stopRecording(); },
  'modifier-granted': (data) => addModifier(data.modifier),
  'modifier-used': (data) => removeModifier(data.modifierId),
  'team-state': (data) => updateTeamState(data.teams),
  'answer-verified': (data) => handleAnswerVerification(data)
};

function handleMessage(data) {
  MSG_HANDLERS[data.type]?.(data);
}

function showGameScreen(data) {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  
  const teamColors = ['Red', 'Blue', 'Green'];
  document.getElementById('player-info').textContent = `${myName} (${teamColors[myTeam]})`;
  document.getElementById('connection-status').classList.add('connected');
  updateScoreDisplay();
  
  if (data.modifiers) {
    myModifiers = data.modifiers;
    updateModifiersDisplay();
  }
}

function setState(state) {
  const states = ['waiting-state', 'buzzing-state', 'lockedout-state', 'recording-state'];
  states.forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(state).classList.remove('hidden');
}

function enableBuzzing(data) {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.remove('locked', 'buzzed');
  buzzer.disabled = false;
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZ!';
  setState('buzzing-state');
  if (data?.questionValue) {
    currentQuestionValue = data.questionValue;
  }
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

async function startRecording(data) {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.add('buzzed');
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZED!';
  
  // Transition to recording state
  setState('recording-state');
  document.getElementById('transcript-preview').textContent = '';
  document.getElementById('transcript-preview').classList.remove('has-text');
  recordedTranscript = '';
  
  // Use Web Speech API for transcription
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError('Speech recognition not supported in this browser. Try Chrome.');
    resetBuzzer();
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    recordedTranscript += finalTranscript;
    const preview = document.getElementById('transcript-preview');
    preview.textContent = recordedTranscript || interimTranscript;
    preview.classList.add('has-text');
  };
  
  recognition.onerror = (err) => {
    console.error('Speech recognition error:', err);
  };
  
  recognition.onend = () => {
    // Only auto-submit if we have a transcript and haven't manually stopped
    if (recordedTranscript && isRecording) {
      submitTranscript();
    }
  };
  
  try {
    recognition.start();
    isRecording = true;
    
    // Auto-stop after 8 seconds
    setTimeout(() => {
      if (isRecording) {
        stopRecording();
      }
    }, 8000);
  } catch (err) {
    console.error('Failed to start speech recognition:', err);
    showError('Could not start speech recognition.');
    resetBuzzer();
  }
}

function stopRecording() {
  if (recognition && isRecording) {
    recognition.stop();
    isRecording = false;
    submitTranscript();
  }
}

function stopRecordingAndSubmit() {
  stopRecording();
}

async function submitTranscript() {
  if (!recordedTranscript) return;
  
  try {
    const response = await fetch('/api/submit-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: myTeam,
        player: myName,
        questionValue: currentQuestionValue,
        transcript: recordedTranscript
      })
    });
    
    const result = await response.json();
    
    // Show final transcript
    const preview = document.getElementById('transcript-preview');
    preview.textContent = recordedTranscript;
    preview.classList.add('has-text');
    
    // Wait a moment then return to waiting state
    setTimeout(() => {
      if (!isRecording) {
        setState('waiting-state');
      }
    }, 2000);
    
  } catch (err) {
    console.error('Failed to submit answer:', err);
    setState('waiting-state');
  }
}

function handleAnswerVerification(data) {
  // Server will send this via WebSocket after processing
  // The teacher will receive the result and handle scoring
}

function lockoutBuzzer() {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.add('locked');
  buzzer.disabled = true;
  setState('lockedout-state');
}

function resetBuzzer() {
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.remove('locked', 'buzzed');
  buzzer.disabled = false;
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZ!';
  setState('waiting-state');
}

function addModifier(modifier) {
  myModifiers.push(modifier);
  updateModifiersDisplay();
}

function removeModifier(modifierId) {
  myModifiers = myModifiers.filter(m => m.id !== modifierId);
  updateModifiersDisplay();
}

function updateModifiersDisplay() {
  const container = document.getElementById('modifiers-list');
  
  if (myModifiers.length === 0) {
    container.innerHTML = '<span class="no-modifiers">No modifiers yet</span>';
    return;
  }
  
  container.innerHTML = myModifiers.map(mod => `
    <div class="modifier-item" onclick="useModifier('${mod.id}')" title="${mod.description}">
      ${mod.icon} ${mod.name}
    </div>
  `).join('');
}

function updateTeamState(teams) {
  const myTeamData = teams.find(t => t.id === myTeam);
  if (myTeamData) {
    myModifiers = myTeamData.modifiers || [];
    myTeamScore = myTeamData.score || 0;
    updateModifiersDisplay();
    updateScoreDisplay();
  }
}

function updateScoreDisplay() {
  const scoreEl = document.getElementById('team-score');
  scoreEl.textContent = `$${myTeamScore}`;
  scoreEl.style.color = myTeamScore >= 0 ? '#00ff00' : '#ff4444';
}

function useModifier(modifierId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const modifier = myModifiers.find(m => m.id === modifierId);
  if (!modifier) return;
  
  ws.send(JSON.stringify({
    type: 'use-modifier',
    modifierId,
    team: myTeam,
    player: myName
  }));
}
