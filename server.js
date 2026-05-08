const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const multer = require('multer');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONFIGS_DIR = path.join(__dirname, 'configs');
const DEFAULT_ROOM_CODE = 'GAME';

// Maximum attempts before a question becomes USED automatically
const MAX_EXPLANATION_ATTEMPTS = 3;

// Ensure directories exist
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
// AUDIO TRANSCRIPTION
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
      name: "Plot & Summary",
      questions: [
        { 
          value: 200, 
          question: "The protagonist's main motivation throughout the essay.", 
          answer: ["What is reading?", "What is literacy?", "What is learning to read?"] 
        },
        { 
          value: 400, 
          question: "Where the protagonist grew up, which shaped his educational experience.", 
          answer: ["What is a reservation?", "What is the reservation?", "What is an Indian reservation?"] 
        },
        { 
          value: 600, 
          question: "What the protagonist refused to do, despite expectations placed on him.", 
          answer: ["What is fail?", "What is to fail?", "What is failing in school?"] 
        },
        { 
          value: 800, 
          question: "What the protagonist became professionally, despite never being taught creative writing.", 
          answer: ["What is a writer?", "What is an author?", "What is writing?"] 
        },
        { 
          value: 1000, 
          question: "The ultimate purpose behind the protagonist's obsessive reading, stated explicitly in the essay.", 
          answer: ["What is to save his life?", "What is saving his life?", "What is survival?"] 
        },
      ]
    },
    {
      name: "Key Quotes",
      questions: [
        { 
          value: 200, 
          question: "This object is what the protagonist says he learned to read with.", 
          answer: ["What is a Superman comic book?", "What is a comic book?", "What is Superman?"] 
        },
        { 
          value: 400, 
          question: "Complete this quote: 'Despite all the books I read, I am still surprised I became a ______.'", 
          answer: ["What is writer?", "What is a writer?"] 
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
        { 
          value: 1000, 
          question: "This three-part anaphora appears twice in the essay to describe the protagonist's self-perception.", 
          answer: ["What is 'I am smart. I am arrogant. I am lucky.'?", "What is 'I was smart. I was arrogant. I was lucky.'?"] 
        },
      ]
    },
    {
      name: "Perspective & Voice",
      questions: [
        { 
          value: 200, 
          question: "The narrative perspective used throughout the essay.", 
          answer: ["What is first-person?", "What is first-person point of view?", "What is first-person narration?"] 
        },
        { 
          value: 400, 
          question: "The pronoun the protagonist uses to refer to himself in the opening, creating emotional distance.", 
          answer: ["What is 'he'?", "What is the third-person pronoun 'he'?"] 
        },
        { 
          value: 600, 
          question: "The rhetorical shift that occurs in the final paragraph, changing 'my life' to this.", 
          answer: ["What is 'our lives'?", "What is the collective 'our'?"] 
        },
        { 
          value: 800, 
          question: "This literary device is used when the protagonist says he reads with 'equal parts joy and desperation.'", 
          answer: ["What is juxtaposition?", "What is contrast?", "What is paradox?"] 
        },
        { 
          value: 1000, 
          question: "The tone created by the repeated phrase 'Books,' I say to them. 'Books,' I say.", 
          answer: ["What is urgency?", "What is insistence?", "What is persistence?", "What is a pleading tone?"] 
        },
      ]
    },
    {
      name: "Metaphor & Symbolism",
      questions: [
        { 
          value: 200, 
          question: "Reading is metaphorically described as this life-or-death action.", 
          answer: ["What is saving a life?", "What is survival?", "What is rescue?"] 
        },
        { 
          value: 400, 
          question: "The students who refuse to engage are described as having these, which the protagonist tries to break through.", 
          answer: ["What are locked doors?", "What is a locked door?"] 
        },
        { 
          value: 600, 
          question: "Empty notebooks and missing pens symbolize this for the defeated students.", 
          answer: ["What is unrealized potential?", "What is silenced voice?", "What is lost opportunity?"] 
        },
        { 
          value: 800, 
          question: "The phrase 'throw my weight against their locked doors' uses this type of figurative language.", 
          answer: ["What is a metaphor?", "What is metaphorical language?"] 
        },
        { 
          value: 1000, 
          question: "The window that defeated students 'stare out of' symbolizes this.", 
          answer: ["What is longing for freedom?", "What is desire for escape?", "What is hope for something beyond?", "What is a barrier between inside and outside?"] 
        },
      ]
    },
    {
      name: "Themes & Context",
      questions: [
        { 
          value: 200, 
          question: "This systemic issue explains why Native students were 'expected to be stupid' in the classroom.", 
          answer: ["What is racism?", "What is discrimination?", "What is educational inequity?", "What is colonialism?"] 
        },
        { 
          value: 400, 
          question: "The essay critiques this type of education that disconnected Native children from their culture.", 
          answer: ["What is assimilationist education?", "What is colonial education?", "What is forced assimilation?"] 
        },
        { 
          value: 600, 
          question: "The protagonist's ability to tell 'complicated stories' at home but be 'monosyllabic' at school illustrates this concept.", 
          answer: ["What is code-switching?", "What is linguistic code-switching?", "What is cultural code-switching?"] 
        },
        { 
          value: 800, 
          question: "The essay suggests that the absence of Native writers in the curriculum perpetuates this limiting belief.", 
          answer: ["What is 'you can't be what you can't see'?", "What is lack of representation?", "What is invisible role models?"] 
        },
        { 
          value: 1000, 
          question: "The protagonist's return to teach on the reservation represents this broader concept of breaking cycles.", 
          answer: ["What is intergenerational healing?", "What is giving back?", "What is community responsibility?", "What is decolonizing education?"] 
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
    questionAttempts: new Map() // Tracks attempts per question index for explanation workflow
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
  const sendIfOpen = (ws) => ws?.readyState === 1 && ws.send(msg);
  
  if (target !== 'student' && room.teacher) sendIfOpen(room.teacher.ws);
  if (target !== 'teacher') room.students.forEach(s => sendIfOpen(s.ws));
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
  
  const teamSizes = room.teams.map(t => t.length);
  const minSize = Math.min(...teamSizes);
  const availableTeams = teamSizes.map((size, i) => size === minSize ? i : null).filter(i => i !== null);
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
  if (!room || room.buzzQueue.find(b => b.team === data.team)) return;
  
  room.buzzQueue.push({ team: data.team, player: data.player, time: Date.now() });
  broadcastToRoom(room.code, { 
    type: 'buzz-accepted', 
    team: data.team, 
    player: data.player, 
    position: room.buzzQueue.length,
    questionValue: room.currentQuestion?.value || 0
  }, 'all');
  if (room.teacher) send(room.teacher.ws, 'buzz-queue', { queue: room.buzzQueue });
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

function handleTeamState(data, clientInfo) {
  if (clientInfo.role !== 'teacher') return;
  broadcastToRoom(clientInfo.room, { type: 'team-state', teams: data.teams }, 'student');
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
    broadcastToRoom(client.room, { type: 'question-close' }, 'student');
  },
  'team-state': handleTeamState,
  'broadcast-result': handleBroadcastResult
};

function handleMessage(data, clientInfo) {
  const handler = HANDLERS[data.type];
  if (handler) handler(data, clientInfo);
}

wss.on('connection', (ws) => {
  let clientInfo = { ws, role: null, room: null };

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(data, clientInfo);
    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    if (clientInfo.room && clientInfo.role) {
      handleDisconnect(clientInfo);
    }
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

server.listen(PORT, () => {
  console.log(`Jeopardy server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
