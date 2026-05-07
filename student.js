// Configuration - Update this with your ngrok URL (e.g., 'wss://abc123.ngrok.io')
const WS_URL = 'wss://zoophagous-yasmine-unblightedly.ngrok-free.app';
const DEFAULT_ROOM = 'GAME';
let ws = null;
let currentState = 'waiting';
let myTeam = null;
let myName = '';
let myTeamScore = 0;

// Audio recording
let mediaRecorder = null;
let audioChunks = [];
let currentQuestionValue = 0;
let isRecording = false;
let recordedTranscript = '';

// Helper function to create WAV blob from PCM data
function createWavBlob(pcmData, sampleRate) {
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length * bytesPerSample;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // PCM data
  const offset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(offset + i * 2, pcmData[i], true);
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
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
  console.log('Starting recording...');
  const buzzer = document.getElementById('buzzer');
  buzzer.classList.add('buzzed');
  buzzer.querySelector('.buzzer-text').textContent = 'BUZZED!';
  
  // Transition to recording state
  setState('recording-state');
  document.getElementById('transcript-preview').textContent = 'Recording...';
  document.getElementById('transcript-preview').classList.remove('has-text');
  recordedTranscript = '';
  audioChunks = [];
  
  // Check HTTPS requirement for microphone
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    showError('Microphone requires HTTPS. Using localhost or HTTPS.');
    resetBuzzer();
    return;
  }
  
  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create MediaRecorder with default settings
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      // Stop all tracks to release microphone
      stream.getTracks().forEach(track => track.stop());
      
      // Create audio blob and convert to PCM
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      
      try {
        // Convert webm to PCM using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(audioBuffer.length);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < channelData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
        }
        
        // Create WAV blob
        const wavBlob = createWavBlob(pcmData, audioBuffer.sampleRate);
        
        const formData = new FormData();
        formData.append('audio', wavBlob, 'answer.wav');
        formData.append('team', myTeam);
        formData.append('player', myName);
        formData.append('questionValue', currentQuestionValue);
        
        const response = await fetch('/api/submit-answer', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        
        // Show transcript returned from server
        const preview = document.getElementById('transcript-preview');
        preview.textContent = result.transcript || '(no speech detected)';
        preview.classList.add('has-text');
        
        // Wait a moment then return to waiting state
        setTimeout(() => {
          if (!isRecording) {
            setState('waiting-state');
          }
        }, 2000);
        
      } catch (err) {
        console.error('Failed to process audio:', err);
        document.getElementById('transcript-preview').textContent = 'Error processing audio';
        setTimeout(() => setState('waiting-state'), 2000);
      }
    };
    
    mediaRecorder.onerror = (err) => {
      console.error('MediaRecorder error:', err);
      showError('Recording error occurred.');
      resetBuzzer();
    };
    
    // Start recording
    mediaRecorder.start();
    isRecording = true;
    console.log('Recording started');
    
    // Auto-stop after 8 seconds
    setTimeout(() => {
      if (isRecording && mediaRecorder?.state === 'recording') {
        stopRecording();
      }
    }, 8000);
  } catch (err) {
    console.error('Failed to start recording:', err);
    showError('Could not access microphone. Please check permissions.');
    resetBuzzer();
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById('transcript-preview').textContent = 'Processing...';
  }
}

function stopRecordingAndSubmit() {
  stopRecording();
}

// Legacy function for compatibility
async function submitTranscript() {
  // This function is no longer used, kept for compatibility
  console.log('submitTranscript is deprecated, use submitAudio instead');
}

async function submitAudio(audioBlob) {
  try {
    // Create form data with audio file
    const formData = new FormData();
    formData.append('audio', audioBlob, 'answer.webm');
    formData.append('team', myTeam);
    formData.append('player', myName);
    formData.append('questionValue', currentQuestionValue);
    
    const response = await fetch('/api/submit-answer', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    // Show transcript returned from server
    const preview = document.getElementById('transcript-preview');
    preview.textContent = result.transcript || '(no speech detected)';
    preview.classList.add('has-text');
    
    // Wait a moment then return to waiting state
    setTimeout(() => {
      if (!isRecording) {
        setState('waiting-state');
      }
    }, 2000);
    
  } catch (err) {
    console.error('Failed to submit answer:', err);
    document.getElementById('transcript-preview').textContent = 'Error processing answer';
    setTimeout(() => setState('waiting-state'), 2000);
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

