const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const multer = require('multer');

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONFIGS_DIR = path.join(__dirname, 'configs');
const DEFAULT_ROOM_CODE = 'GAME';
const MAX_EXPLANATION_ATTEMPTS = 3;

// Ensure upload and config directories exist
[UPLOADS_DIR, CONFIGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Configure multer for audio uploads
const upload = multer({ 
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const playerName = req.body.player || 'unknown';
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `${playerName}-${timestamp}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.static(__dirname));
app.use(express.json());

// ============================================================================
// AUDIO TRANSCRIPTION HELPER
// ============================================================================

/**
 * Transcribe audio buffer to text (placeholder)
 * Replace with actual speech-to-text implementation
 */
async function transcribeAudio(_) {
  console.log('transcribeAudio called - placeholder function');
  return '';
}

// ============================================================================
// GAME DATA & STATE MANAGEMENT
// ============================================================================

const rooms = new Map();

const defaultGameData = {
  categories: [
    {
      name: "Key Points to Consider",
      questions: [
        { 
          value: 200, 
          question: "Alexie's family lives on an Indian ____", 
          answer: ["What is a reservation?", "What is reservation?"] 
        },
        { 
          value: 400, 
          question: "What the protagonist became professionally, despite never being taught creative writing?", 
          answer: ["What is a writer?", "What is an author?"] 
        },
        { 
          value: 600, 
          question: "The ultimate purpose behind the protagonist's obsessive reading, stated explicitly in the essay", 
          answer: ["What is to save his life?", "What is survival?"] 
        },
        { 
          value: 800, 
          question: "According to the author, a smart Indian is hated by both white people and____", 
          answer: ["What are other Indians?", "What is other Indians?"] 
        },
      ]
    },
    {
      name: "Narrative Perspectives",
      questions: [
        { 
          value: 200, 
          question: "Narration by character in story—use of 'I', 'my', 'we'", 
          answer: ["What is first-person point of view?", "What is 1st person POV?"] 
        },
        { 
          value: 400, 
          question: "Speaker directly addresses reader—use of 'you'", 
          answer: ["What is second-person point of view?", "What is 2nd person POV?"] 
        },
        { 
          value: 600, 
          question: "Speaker is outside of story—describes with 'he/she/they'. Narrator has access to all characters' feelings and thoughts", 
          answer: ["What is third-person omniscient point of view?", "What is 3rd omniscient POV?"] 
        },
        { 
          value: 800, 
          question: "Speaker is outside of story—describes with 'he/she/they'. Narrator restricted viewpoint to a single person's inner thoughts", 
          answer: ["What is third-person limited point of view?", "What is 3rd limited POV?"] 
        },
      ]
    },
    {
      name: "Key Quotes",
      questions: [
        { 
          value: 200, 
          question: "This object is what the protagonist says he learned to read with.", 
          answer: ["What is a Superman comic book?", "What is a comic book?"] 
        },
        { 
          value: 400, 
          question: "Complete this quote: 'Despite all the books I read, I am still surprised I became a ______.'", 
          answer: ["What is writer?", "What is author?"] 
        },
        { 
          value: 600, 
          question: "This phrase describes how a smart Indian boy is perceived: 'widely feared and ______ by Indians and non-Indians alike.'", 
          answer: ["What is ridiculed?", "What is mocked?"] 
        },
        { 
          value: 800, 
          question: "Complete this quote about expectations: 'If he'd been anything but an Indian boy living on a reservation, he might have been called a prodigy. But he is an Indian boy living on a reservation and is simply an ______.'", 
          answer: ["What is oddity?", "What is an oddity?"] 
        },
      ]
    },
    {
      name: "Complete this quote",
      questions: [
        { 
          value: 200, 
          question: "Complete this quote: 'This knowledge delighted me. I began to think of everything in terms of___. Our reservation was a small____ within the United States'", 
          answer: ["What is paragraph?", "What is a paragraph?"] 
        },
        { 
          value: 400, 
          question: "'There must have been visiting teachers. Who were they? Where are they now? Do they exist?' The author infers that if one never sees something, one has no idea it ____", 
          answer: ["What is exists?", "What is exist?"] 
        },
        { 
          value: 600, 
          question: "'I was smart. I was arrogant. I was lucky.' The author infers these were key traits for him to____; he argues that education system wants Indians to ____", 
          answer: ["What is succeed, fail?", "What is to succeed and to fail?"] 
        },
        { 
          value: 800, 
          question: "'I throw my weight against their locked doors. The door holds.' The author uses the repeated element of door to allude that he is____", 
          answer: ["What is Superman?", "What is like Superman?"] 
        },
      ]
    }
  ]
};

let gameData = { ...defaultGameData };

// ============================================================================
// ROOM MANAGEMENT HELPERS
// ============================================================================

function createRoom(code) {
  return {
    code,
    teacher: null,
    students: new Map(),
    teams: [[], [], [], [], [], []],
    state: 'waiting',
    buzzQueue: [],
    currentQuestion: null,
    questionAttempts: new Map(),
    disabledTeamsPerQuestion: new Map(),
    explanationMode: false,
    wrongTeamId: null
  };
}

// Create default room on startup
rooms.set(DEFAULT_ROOM_CODE, createRoom(DEFAULT_ROOM_CODE));
console.log(`Default room '${DEFAULT_ROOM_CODE}' created`);

function findRoomByPlayer(playerName) {
  for (const room of rooms.values()) {
    for (const student of room.students.values()) {
      if (student.name === playerName) {
        return room;
      }
    }
  }
  return null;
}

function send(ws, type, data) {
  ws.send(JSON.stringify({ type, ...data }));
}

function broadcastToRoom(roomCode, message, target = 'all') {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const msg = JSON.stringify(message);
  
  const sendIfOpen = (ws, recipient) => {
    if (!ws || ws.readyState !== 1) {
      console.log(`Cannot send to ${recipient}: readyState=${ws?.readyState}`);
      return;
    }
    try {
      ws.send(msg);
    } catch (err) {
      console.error(`Failed to send to ${recipient}:`, err.message);
    }
  };
  
  if (target !== 'student' && room.teacher) {
    sendIfOpen(room.teacher.ws, `teacher-${roomCode}`);
  }
  if (target !== 'teacher') {
    room.students.forEach((s, playerId) => {
      sendIfOpen(s.ws, `student-${playerId}`);
    });
  }
}

function clearBuzzQueue(roomCode) {
  rooms.get(roomCode)?.buzzQueue?.splice(0);
}

// ============================================================================
// API ROUTES - GAME DATA
// ============================================================================

app.get('/api/game', (req, res) => {
  res.json(gameData);
});

// ============================================================================
// API ROUTES - AUDIO FILE MANAGEMENT
// ============================================================================

app.get('/api/audio-files', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR)
      .filter(file => file.endsWith('.webm'))
      .map(file => {
        const filePath = path.join(UPLOADS_DIR, file);
        const stats = fs.statSync(filePath);
        return { name: file, size: stats.size, created: stats.birthtime };
      })
      .sort((a, b) => b.created - a.created);
    
    res.json(files);
  } catch (error) {
    console.error('Error listing audio files:', error);
    res.status(500).json({ error: 'Failed to list audio files' });
  }
});

app.post('/api/test-transcribe', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Filename required' });
    }
    
    const filePath = path.join(UPLOADS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    console.log(`Testing transcription for: ${filename}`);
    const startTime = Date.now();
    
    const audioBuffer = fs.readFileSync(filePath);
    const transcript = await transcribeAudio(audioBuffer);
    const processingTime = Date.now() - startTime;
    
    console.log(`Transcription result for ${filename}: "${transcript}"`);
    
    res.json({
      success: true,
      transcript: transcript || '[Manual verification needed]',
      processingTime
    });
  } catch (error) {
    console.error('Test transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API ROUTES - ANSWER SUBMISSION
// ============================================================================

app.post('/api/submit-answer', upload.single('audio'), async (req, res) => {
  try {
    const { team, player, questionValue } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received' });
    }
    
    const room = findRoomByPlayer(player);
    if (!room || !room.currentQuestion) {
      return res.status(400).json({ error: 'No active question' });
    }
    
    console.log(`Audio file saved: ${req.file.path}`);
    console.log(`File size: ${req.file.size} bytes`);
    
    const audioBuffer = fs.readFileSync(req.file.path);
    
    console.log('Transcribing audio...');
    const transcript = await transcribeAudio(audioBuffer);
    console.log('Transcription result:', transcript);
    
    if (room.teacher) {
      send(room.teacher.ws, 'answer-verified', {
        team: parseInt(team),
        player,
        transcript: transcript || '[Manual verification needed]',
        questionValue: parseInt(questionValue)
      });
    }
    
    res.json({ transcript: transcript || '[Manual verification needed]' });
  } catch (err) {
    console.error('Error processing answer:', err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// ============================================================================
// API ROUTES - MANUAL ANSWER VERIFICATION
// ============================================================================

app.post('/api/verify-answer', async (req, res) => {
  try {
    const { team, player, questionValue, isCorrect, questionIndex } = req.body;
    
    const room = findRoomByPlayer(player);
    if (!room || !room.currentQuestion) {
      return res.status(400).json({ error: 'No active question' });
    }
    
    console.log(`Teacher verified answer: ${player} - ${isCorrect ? 'Correct' : 'Wrong'}`);
    
    // Track attempts for explanation workflow
    if (!isCorrect) {
      let attempts = room.questionAttempts.get(questionIndex) || 0;
      attempts++;
      room.questionAttempts.set(questionIndex, attempts);
      
      // Disable this team from buzzing again for this question
      const questionKey = `${room.currentQuestion.categoryIndex}-${questionIndex}`;
      let disabledTeams = room.disabledTeamsPerQuestion.get(questionKey);
      if (!disabledTeams) {
        disabledTeams = new Set();
        room.disabledTeamsPerQuestion.set(questionKey, disabledTeams);
      }
      disabledTeams.add(parseInt(team));
      
      // Check if max attempts reached - mark as USED
      if (attempts >= MAX_EXPLANATION_ATTEMPTS) {
        broadcastToRoom(room.code, {
          type: 'question-max-attempts',
          questionIndex,
          message: 'Maximum attempts reached. Question is now USED.'
        });
      }
    } else {
      // Correct answer - clear attempts and mark answered
      room.questionAttempts.delete(questionIndex);
      // Also clear disabled teams for this question since it's now answered
      const questionKey = `${room.currentQuestion.categoryIndex}-${questionIndex}`;
      room.disabledTeamsPerQuestion.delete(questionKey);
    }
    
    broadcastToRoom(room.code, {
      type: 'answer-graded',
      team: parseInt(team),
      player,
      isCorrect,
      questionValue: parseInt(questionValue),
      questionIndex,
      attempts: room.questionAttempts.get(questionIndex) || 0,
      maxAttempts: MAX_EXPLANATION_ATTEMPTS
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error verifying answer:', err);
    res.status(500).json({ error: 'Failed to verify answer' });
  }
});

// ============================================================================
// API ROUTES - ROOM MANAGEMENT
// ============================================================================

app.get('/api/debug/rooms', (req, res) => {
  const roomList = [];
  for (const [code, room] of rooms.entries()) {
    roomList.push({
      code,
      hasTeacher: !!room.teacher,
      studentCount: room.students.size,
      teams: room.teams.map(t => t.length),
      currentQuestion: room.currentQuestion ? 'yes' : 'no'
    });
  }
  res.json({ activeRooms: roomList, totalRooms: rooms.size });
});

app.post('/api/room', (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms.set(roomCode, createRoom(roomCode));
  res.json({ roomCode });
});

// ============================================================================
// API ROUTES - ADMIN CONFIGURATION
// ============================================================================

app.get('/api/admin/configs', (req, res) => {
  try {
    const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
    const configs = files.map(f => ({ name: f.replace('.json', '') }));
    res.json(configs);
  } catch (err) {
    console.error('Failed to list configs:', err);
    res.status(500).json({ error: 'Failed to list configurations' });
  }
});

app.get('/api/admin/config/:name', (req, res) => {
  try {
    const configFile = path.join(CONFIGS_DIR, `${req.params.name}.json`);
    
    if (!fs.existsSync(configFile)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json({ name: req.params.name, config });
  } catch (err) {
    console.error('Failed to load config:', err);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

app.post('/api/admin/save', (req, res) => {
  try {
    const { name, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config required' });
    }
    
    const configFile = path.join(CONFIGS_DIR, `${name}.json`);
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save config:', err);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.delete('/api/admin/config/:name', (req, res) => {
  try {
    const configFile = path.join(CONFIGS_DIR, `${req.params.name}.json`);
    
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete config:', err);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

app.post('/api/admin/activate', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Configuration name required' });
    }
    
    const configFile = path.join(CONFIGS_DIR, `${name}.json`);
    if (!fs.existsSync(configFile)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    gameData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json({ success: true, name });
  } catch (err) {
    console.error('Failed to activate config:', err);
    res.status(500).json({ error: 'Failed to activate configuration' });
  }
});

app.get('/api/admin/default', (req, res) => {
  res.json({ categories: defaultGameData.categories });
});

// ============================================================================
// WEBSOCKET MESSAGE HANDLERS
// ============================================================================

function handleTeacherJoin(data, clientInfo) {
  const roomCode = data.roomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = rooms.get(roomCode) || createRoom(roomCode);
  rooms.set(roomCode, room);
  
  room.teacher = clientInfo;
  Object.assign(clientInfo, { role: 'teacher', room: roomCode });
  
  send(clientInfo.ws, 'join-success', { roomCode, role: 'teacher' });
}

function handleStudentJoin(data, clientInfo) {
  let room = rooms.get(data.roomCode);
  if (!room) {
    room = createRoom(data.roomCode);
    rooms.set(data.roomCode, room);
  }
  
  // Find team with minimum players for balanced assignment
  const teamSizes = room.teams.map(t => t.length);
  const minSize = Math.min(...teamSizes);
  const availableTeams = teamSizes
    .map((size, i) => size === minSize ? i : null)
    .filter(i => i !== null);
  const assignedTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
  
  const playerId = uuidv4();
  const player = { id: playerId, name: data.name, team: assignedTeam, ws: clientInfo.ws };
  
  room.students.set(playerId, player);
  room.teams[assignedTeam].push(player);
  Object.assign(clientInfo, { role: 'student', room: room.code, playerId });
  
  send(clientInfo.ws, 'join-success', { roomCode: room.code, role: 'student', team: assignedTeam });
  broadcastToRoom(room.code, { type: 'player-joined', name: data.name, team: assignedTeam }, 'teacher');
}

function handleBuzz(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  
  console.log(`[BUZZ] Team ${data.team}, player ${data.player} in room ${clientInfo.room}`);
  
  if (!room) {
    console.log(`[BUZZ REJECTED] Room ${clientInfo.room} not found`);
    send(clientInfo.ws, 'buzz-rejected', { reason: 'Room not found' });
    return;
  }
  
  // Check if we're in explanation mode
  if (room.explanationMode) {
    // Only allow teams OTHER than the wrong team to buzz
    if (data.team === room.wrongTeamId) {
      console.log(`[BUZZ REJECTED] Wrong team cannot buzz during explanation`);
      send(clientInfo.ws, 'buzz-rejected', { reason: 'Your team cannot buzz during explanation' });
      return;
    }
    
    // For explanation mode, accept the first buzz and notify teacher
    if (room.buzzQueue.length === 0) {
      room.buzzQueue.push({ team: data.team, player: data.player, time: Date.now() });
      console.log(`[EXPLANATION BUZZ ACCEPTED] Team ${data.team}, player ${data.player}`);
      
      // Notify teacher that someone buzzed for explanation
      if (room.teacher) {
        send(room.teacher.ws, 'explanation-buzz', { 
          team: data.team, 
          player: data.player 
        });
      }
      
      // Notify all students that someone buzzed
      broadcastToRoom(room.code, { 
        type: 'buzz-accepted', 
        team: data.team, 
        player: data.player, 
        position: 1,
        isExplanation: true
      }, 'all');
    } else {
      // Already someone buzzed, reject
      console.log(`[EXPLANATION BUZZ REJECTED] Someone already buzzed`);
      send(clientInfo.ws, 'buzz-rejected', { reason: 'Someone already buzzed' });
    }
    return;
  }
  
  if (!room.currentQuestion) {
    console.log(`[BUZZ REJECTED] No active question`);
    send(clientInfo.ws, 'buzz-rejected', { reason: 'No active question' });
    return;
  }
  
  if (room.buzzQueue.some(b => b.team === data.team)) {
    console.log(`[BUZZ REJECTED] Team ${data.team} already buzzed`);
    send(clientInfo.ws, 'buzz-rejected', { reason: 'Team already buzzed' });
    return;
  }
  
  const questionKey = `${room.currentQuestion?.categoryIndex}-${room.currentQuestion?.questionIndex}`;
  const disabledTeams = room.disabledTeamsPerQuestion.get(questionKey) || new Set();
  if (disabledTeams.has(data.team)) {
    console.log(`[BUZZ REJECTED] Team ${data.team} disabled for this question`);
    send(clientInfo.ws, 'buzz-rejected', { reason: 'Team disabled for this question' });
    return;
  }
  
  room.buzzQueue.push({ team: data.team, player: data.player, time: Date.now() });
  console.log(`[BUZZ ACCEPTED] Team ${data.team}, player ${data.player}, position ${room.buzzQueue.length}`);
  
  broadcastToRoom(room.code, { 
    type: 'buzz-accepted', 
    team: data.team, 
    player: data.player, 
    position: room.buzzQueue.length,
    questionValue: room.currentQuestion?.value || 0
  }, 'all');
  
  if (room.teacher) {
    send(room.teacher.ws, 'buzz-queue', { queue: room.buzzQueue });
  }
}

function handleQuestionOpen(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (room) {
    room.currentQuestion = {
      value: data.questionValue,
      correctAnswer: data.correctAnswer
    };
    broadcastToRoom(clientInfo.room, { 
      type: 'question-open',
      questionValue: data.questionValue 
    }, 'student');
  }
}

function handleBroadcastResult(data, clientInfo) {
  broadcastToRoom(clientInfo.room, {
    type: 'answer-result',
    player: data.player,
    transcript: data.transcript,
    isCorrect: data.isCorrect
  }, 'student');
}

function handleExplanationStart(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (!room || clientInfo.role !== 'teacher') return;
  
  room.explanationMode = true;
  room.wrongTeamId = data.wrongTeamId;
  room.buzzQueue = []; // Clear buzz queue for explanation round
  
  console.log(`[EXPLANATION START] Wrong team: ${data.wrongTeamId}`);
  
  // Notify all students that explanation round has started
  broadcastToRoom(clientInfo.room, { 
    type: 'explanation-start',
    wrongTeamId: data.wrongTeamId,
    questionValue: data.questionValue
  }, 'student');
}

function handleExplanationEnd(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (!room || clientInfo.role !== 'teacher') return;
  
  room.explanationMode = false;
  room.wrongTeamId = null;
  room.buzzQueue = []; // Clear buzz queue
  
  console.log('[EXPLANATION END]');
  
  // Notify all students that explanation round has ended
  broadcastToRoom(clientInfo.room, { type: 'explanation-end' }, 'student');
}

function handleTeamState(data, clientInfo) {
  if (clientInfo.role !== 'teacher') return;
  broadcastToRoom(clientInfo.room, { type: 'team-state', teams: data.teams }, 'student');
}

function handleKickTeam(data, clientInfo) {
  if (clientInfo.role !== 'teacher') return;
  
  const room = rooms.get(clientInfo.room);
  if (!room) return;
  
  const teamId = data.teamId;
  const playersToKick = [...room.teams[teamId]];
  
  room.teams[teamId] = [];
  
  playersToKick.forEach(player => {
    const studentEntry = [...room.students.entries()].find(([_, s]) => s.id === player.id);
    if (studentEntry) {
      const [playerId, student] = studentEntry;
      send(student.ws, 'kicked', { message: 'You have been removed from the team. Please rejoin with a new name.' });
      room.students.delete(playerId);
    }
  });
  
  broadcastToRoom(room.code, { type: 'player-left', name: 'All players', team: teamId }, 'teacher');
}

function handleDisconnect(clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (!room) return;
  
  if (clientInfo.role === 'teacher') {
    broadcastToRoom(clientInfo.room, { type: 'teacher-disconnected' }, 'student');
    rooms.delete(clientInfo.room);
  } else if (clientInfo.playerId) {
    const student = room.students.get(clientInfo.playerId);
    if (!student) return;
    
    room.teams[student.team] = room.teams[student.team].filter(p => p.id !== clientInfo.playerId);
    room.students.delete(clientInfo.playerId);
    broadcastToRoom(clientInfo.room, { type: 'player-left', name: student.name, team: student.team }, 'teacher');
  }
}

// ============================================================================
// WEBSOCKET SERVER SETUP
// ============================================================================

const HANDLERS = {
  'teacher-join': handleTeacherJoin,
  'join': handleStudentJoin,
  'buzz': handleBuzz,
  'question-open': handleQuestionOpen,
  'question-close': (data, client) => {
    clearBuzzQueue(client.room);
    const room = rooms.get(client.room);
    if (room && room.currentQuestion) {
      const questionKey = `${room.currentQuestion.categoryIndex}-${room.currentQuestion.questionIndex}`;
      room.disabledTeamsPerQuestion.delete(questionKey);
    }
    broadcastToRoom(client.room, { type: 'question-close' }, 'student');
    if (room.teacher) send(room.teacher.ws, 'buzz-queue', { queue: room.buzzQueue });
  },
  'explanation-start': handleExplanationStart,
  'explanation-end': handleExplanationEnd,
  'team-state': handleTeamState,
  'broadcast-result': handleBroadcastResult,
  'kick-team': handleKickTeam
};

function handleMessage(data, clientInfo) {
  const handler = HANDLERS[data.type];
  if (handler) handler(data, clientInfo);
}

wss.on('connection', (ws) => {
  let clientInfo = { ws, role: null, room: null };

  // Ping/pong heartbeat for connection health checking
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
    else clearInterval(pingInterval);
  }, 30000);
  
  ws.on('pong', () => { /* Connection is alive */ });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(data, clientInfo);
    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (clientInfo.room && clientInfo.role) {
      handleDisconnect(clientInfo);
    }
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${clientInfo.room || 'unknown'} (${clientInfo.role || 'unknown'}):`, err.message);
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

server.listen(PORT, () => {
  console.log(`Jeopardy server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
