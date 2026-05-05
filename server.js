const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

// Audio upload setup
const upload = multer({ dest: 'uploads/' });

// Calculate similarity against multiple acceptable answers, return best match
function calculateBestSimilarity(transcript, acceptableAnswers) {
  // Handle both single string and array of answers
  const answers = Array.isArray(acceptableAnswers) ? acceptableAnswers : [acceptableAnswers];
  
  let bestSimilarity = 0;
  let bestMatch = '';
  
  for (const answer of answers) {
    if (!answer) continue;
    const similarity = calculateSimilarity(transcript, answer);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = answer;
    }
  }
  
  return { similarity: bestSimilarity, bestMatch };
}

// Simple similarity using Levenshtein distance
function calculateSimilarity(text1, text2) {
  const s1 = text1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = text2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      matrix[i][j] = s2[i-1] === s1[j-1] 
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[s2.length][s1.length];
}

const rooms = new Map();
const MODIFIERS = [
  { name: 'Double', id: 'double', icon: 'x2', description: 'Next correct answer worth double points' },
  { name: 'Steal', id: 'steal', icon: 'ST', description: 'Steal points from another team' },
  { name: 'Shield', id: 'shield', icon: 'SH', description: 'Block point loss on wrong answer' },
  { name: 'Bank', id: 'bank', icon: 'BK', description: 'Bank your streak bonus immediately' }
];

app.use(express.static('public'));

// Default game data (immutable reference)
const defaultGameData = {
  categories: [
    {
      name: "SCIENCE",
      questions: [
        { value: 200, question: "This planet is known as the Red Planet", answer: "What is Mars?" },
        { value: 400, question: "H2O is the chemical formula for this substance", answer: "What is water?" },
        { value: 600, question: "The speed of light is approximately 300,000 of these per second", answer: "What are kilometers?" },
        { value: 800, question: "This organelle is known as the powerhouse of the cell", answer: "What is the mitochondria?" },
        { value: 1000, question: "Einstein's famous equation E=mc² relates energy to this property", answer: "What is mass?" }
      ]
    },
    {
      name: "HISTORY",
      questions: [
        { value: 200, question: "This war lasted from 1939 to 1945", answer: "What is World War II?" },
        { value: 400, question: "He was the first President of the United States", answer: "Who is George Washington?" },
        { value: 600, question: "The Berlin Wall fell in this year", answer: "What is 1989?" },
        { value: 800, question: "This Egyptian pharaoh's tomb was discovered in 1922 by Howard Carter", answer: "Who is Tutankhamun?" },
        { value: 1000, question: "This document was signed in 1215 and limited the power of the English monarchy", answer: "What is the Magna Carta?" }
      ]
    },
    {
      name: "SPORTS",
      questions: [
        { value: 200, question: "This sport uses a bat and ball with bases", answer: "What is baseball?" },
        { value: 400, question: "This country hosted the 2020 Summer Olympics", answer: "What is Japan?" },
        { value: 600, question: "A touchdown in American football is worth this many points", answer: "What is 6?" },
        { value: 800, question: "This tennis Grand Slam is played on clay courts", answer: "What is the French Open?" },
        { value: 1000, question: "Michael Jordan won 6 NBA championships with this team", answer: "What are the Chicago Bulls?" }
      ]
    },
    {
      name: "LITERATURE",
      questions: [
        { value: 200, question: "He wrote Romeo and Juliet", answer: "Who is William Shakespeare?" },
        { value: 400, question: "This J.K. Rowling series features a boy wizard", answer: "What is Harry Potter?" },
        { value: 600, question: "This George Orwell novel features Big Brother", answer: "What is 1984?" },
        { value: 800, question: "The Great Gatsby was written by this author", answer: "Who is F. Scott Fitzgerald?" },
        { value: 1000, question: "This epic poem by Homer follows Odysseus' journey home", answer: "What is The Odyssey?" }
      ]
    },
    {
      name: "GEOGRAPHY",
      questions: [
        { value: 200, question: "This is the largest ocean on Earth", answer: "What is the Pacific Ocean?" },
        { value: 400, question: "This is the capital of France", answer: "What is Paris?" },
        { value: 600, question: "This river is the longest in the world", answer: "What is the Nile?" },
        { value: 800, question: "This country has the most natural lakes", answer: "What is Canada?" },
        { value: 1000, question: "Mount Everest is located in this mountain range", answer: "What are the Himalayas?" }
      ]
    },
    {
      name: "MOVIES",
      questions: [
        { value: 200, question: "This 1997 movie features Jack and Rose on a sinking ship", answer: "What is Titanic?" },
        { value: 400, question: "This superhero wears a bat costume and fights crime in Gotham", answer: "Who is Batman?" },
        { value: 600, question: "This animated movie features a lion cub named Simba", answer: "What is The Lion King?" },
        { value: 800, question: "The Lord of the Rings movies were directed by this New Zealand filmmaker", answer: "Who is Peter Jackson?" },
        { value: 1000, question: "This 1994 movie starring Tom Hanks follows a man's extraordinary life", answer: "What is Forrest Gump?" }
      ]
    }
  ]
};

// Active game data (can be modified via admin)
let gameData = { ...defaultGameData };

app.get('/api/game', (req, res) => {
  res.json(gameData);
});

// Set active configuration
app.post('/api/admin/activate', express.json(), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Configuration name required' });
    }
    
    const configFile = path.join(configsPath, `${name}.json`);
    if (!fs.existsSync(configFile)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    gameData = config;
    res.json({ success: true, name });
  } catch (err) {
    console.error('Failed to activate config:', err);
    res.status(500).json({ error: 'Failed to activate configuration' });
  }
});

// Answer submission endpoint - accepts transcript from client
app.post('/api/submit-answer', express.json(), async (req, res) => {
  try {
    const { team, player, questionValue, transcript } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript received' });
    }
    
    // Find the room and get the current question's correct answer
    const room = findRoomByPlayer(player);
    if (!room || !room.currentQuestion) {
      return res.status(400).json({ error: 'No active question' });
    }
    
    const acceptableAnswers = room.currentQuestion.correctAnswer;
    
    // Calculate best similarity against all acceptable answers
    const { similarity, bestMatch } = calculateBestSimilarity(transcript, acceptableAnswers);
    
    // Threshold for "close enough" (0.7 = 70% similar)
    const isCorrect = similarity >= 0.7;
    
    // Send result to teacher via WebSocket
    if (room.teacher) {
      send(room.teacher.ws, 'answer-verified', {
        team: parseInt(team),
        player,
        transcript,
        correctAnswer: acceptableAnswers,
        matchedAnswer: bestMatch,
        similarity,
        isCorrect,
        questionValue: parseInt(questionValue)
      });
    }
    
    res.json({ transcript, similarity, isCorrect, matchedAnswer: bestMatch });
  } catch (err) {
    console.error('Error processing answer:', err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// Admin endpoints for game configuration
const configsPath = path.join(__dirname, 'configs');

// Ensure configs directory exists
if (!fs.existsSync(configsPath)) {
  fs.mkdirSync(configsPath, { recursive: true });
}

// Get list of saved configurations
app.get('/api/admin/configs', (req, res) => {
  try {
    const files = fs.readdirSync(configsPath).filter(f => f.endsWith('.json'));
    const configs = files.map(f => ({ name: f.replace('.json', '') }));
    res.json(configs);
  } catch (err) {
    console.error('Failed to list configs:', err);
    res.status(500).json({ error: 'Failed to list configurations' });
  }
});

// Get specific configuration
app.get('/api/admin/config/:name', (req, res) => {
  try {
    const configName = req.params.name;
    const configFile = path.join(configsPath, `${configName}.json`);
    
    if (!fs.existsSync(configFile)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json({ name: configName, config });
  } catch (err) {
    console.error('Failed to load config:', err);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// Save configuration
app.post('/api/admin/save', express.json(), (req, res) => {
  try {
    const { name, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config required' });
    }
    
    const configFile = path.join(configsPath, `${name}.json`);
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save config:', err);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Delete configuration
app.delete('/api/admin/config/:name', (req, res) => {
  try {
    const configName = req.params.name;
    const configFile = path.join(configsPath, `${configName}.json`);
    
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete config:', err);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

// Get default configuration
app.get('/api/admin/default', (req, res) => {
  res.json({ categories: defaultGameData.categories });
});

// Helper to find room by player name
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

app.post('/api/room', (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms.set(roomCode, {
    code: roomCode,
    teacher: null,
    students: new Map(),
    teams: [[], [], []],
    state: 'waiting',
    currentQuestion: null,
    buzzQueue: []
  });
  res.json({ roomCode });
});

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

const HANDLERS = {
  'teacher-join': handleTeacherJoin,
  'join': handleStudentJoin,
  'buzz': handleBuzz,
  'question-open': handleQuestionOpen,
  'question-close': (data, client) => { clearBuzzQueue(client.room); broadcastToRoom(client.room, { type: 'question-close' }, 'student'); },
  'use-modifier': handleUseModifier,
  'grant-modifier': handleGrantModifier,
  'team-state': handleTeamState,
  'broadcast-result': handleBroadcastResult
};

function handleMessage(data, clientInfo) {
  const handler = HANDLERS[data.type];
  if (handler) handler(data, clientInfo);
}

function createRoom(code) {
  return {
    code,
    teacher: null,
    students: new Map(),
    teams: [[], [], []],
    state: 'waiting',
    buzzQueue: [],
    currentQuestion: null
  };
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

function send(ws, type, data) {
  ws.send(JSON.stringify({ type, ...data }));
}

function handleTeacherJoin(data, clientInfo) {
  const roomCode = data.roomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = rooms.get(roomCode) || createRoom(roomCode);
  rooms.set(roomCode, room);
  
  room.teacher = clientInfo;
  Object.assign(clientInfo, { role: 'teacher', room: roomCode });
  
  send(clientInfo.ws, 'join-success', { roomCode, role: 'teacher' });
}

function handleStudentJoin(data, clientInfo) {
  const room = rooms.get(data.roomCode);
  if (!room) return send(clientInfo.ws, 'join-error', { message: 'Room not found' });
  
  // Assign to team with fewest players
  const teamSizes = room.teams.map(t => t.length);
  const minSize = Math.min(...teamSizes);
  const availableTeams = teamSizes.map((size, i) => size === minSize ? i : null).filter(i => i !== null);
  const assignedTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
  
  const playerId = uuidv4();
  const player = { id: playerId, name: data.name, team: assignedTeam, ws: clientInfo.ws, modifiers: [] };
  
  room.students.set(playerId, player);
  room.teams[assignedTeam].push(player);
  Object.assign(clientInfo, { role: 'student', room: room.code, playerId });
  
  send(clientInfo.ws, 'join-success', { roomCode: room.code, role: 'student', team: assignedTeam, modifiers: [] });
  broadcastToRoom(room.code, { type: 'player-joined', name: data.name, team: assignedTeam }, 'teacher');
}

function handleBuzz(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (!room || room.buzzQueue.find(b => b.team === data.team)) return;
  
  room.buzzQueue.push({ team: data.team, player: data.player, time: Date.now() });
  broadcastToRoom(room.code, { type: 'buzz-accepted', team: data.team, player: data.player, position: room.buzzQueue.length }, 'all');
  if (room.teacher) send(room.teacher.ws, 'buzz-queue', { queue: room.buzzQueue });
}

function handleUseModifier(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  const student = room?.students.get(clientInfo.playerId);
  const modifier = student?.modifiers.find(m => m.id === data.modifierId);
  
  if (modifier) {
    student.modifiers = student.modifiers.filter(m => m.id !== data.modifierId);
    if (room.teacher) send(room.teacher.ws, 'modifier-used', { team: data.team, player: data.player, modifier });
    send(clientInfo.ws, 'modifier-used', { modifierId: data.modifierId });
  }
}

function handleGrantModifier(data, clientInfo) {
  const room = rooms.get(clientInfo.room);
  if (!room || clientInfo.role !== 'teacher') return;
  
  room.students.forEach(student => {
    if (student.team === data.teamId) {
      student.modifiers.push({ ...data.modifier });
      send(student.ws, 'modifier-granted', { modifier: data.modifier });
    }
  });
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

server.listen(PORT, () => {
  console.log(`Jeopardy server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
