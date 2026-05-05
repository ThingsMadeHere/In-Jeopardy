const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { pipeline, env } = require('@xenova/transformers');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = 3000;
const SIMILARITY_THRESHOLD = 0.5; // Threshold for semantic similarity match
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

// Disable local model loading to use remote models
env.allowLocalModels = false;
env.useBrowserCache = true;

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));
app.use(express.json());

// ============================================================================
// EMBEDDING MODEL MANAGEMENT
// ============================================================================

let embeddingPipeline = null;

/**
 * Initialize the embedding pipeline for semantic similarity
 */
async function initializeEmbeddingModel() {
  if (!embeddingPipeline) {
    try {
      console.log('Loading embedding model...');
      embeddingPipeline = await pipeline(
        'feature-extraction',
        EMBEDDING_MODEL,
        { quantized: true }
      );
      console.log('Embedding model loaded successfully');
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      throw error;
    }
  }
  return embeddingPipeline;
}

/**
 * Compute embeddings for text using the transformer model
 */
async function computeEmbedding(text) {
  const pipe = await initializeEmbeddingModel();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate best embedding similarity against multiple acceptable answers
 * Returns the highest similarity score and the best matching answer
 */
async function calculateBestEmbeddingSimilarity(transcript, acceptableAnswers) {
  const answers = Array.isArray(acceptableAnswers) ? acceptableAnswers : [acceptableAnswers];
  
  let bestSimilarity = 0;
  let bestMatch = '';
  
  const transcriptEmbedding = await computeEmbedding(transcript);
  
  for (const answer of answers) {
    if (!answer) continue;
    
    const answerEmbedding = await computeEmbedding(answer);
    const similarity = cosineSimilarity(transcriptEmbedding, answerEmbedding);
    
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = answer;
    }
  }
  
  return { similarity: bestSimilarity, bestMatch };
}

// ============================================================================
// GAME DATA & STATE MANAGEMENT
// ============================================================================

const rooms = new Map();

const MODIFIERS = [
  { name: 'Double', id: 'double', icon: 'x2', description: 'Next correct answer worth double points' },
  { name: 'Steal', id: 'steal', icon: 'ST', description: 'Steal points from another team' },
  { name: 'Shield', id: 'shield', icon: 'SH', description: 'Block point loss on wrong answer' },
  { name: 'Bank', id: 'bank', icon: 'BK', description: 'Bank your streak bonus immediately' }
];

const defaultGameData = {
  categories: [
    {
      name: "SCIENCE",
      questions: [
        { value: 200, question: "This planet is known as the Red Planet", answer: ["What is Mars?", "Mars", "The Red Planet", "Planet Mars"] },
        { value: 400, question: "H2O is the chemical formula for this substance", answer: ["What is water?", "Water", "H2O"] },
        { value: 600, question: "The speed of light is approximately 300,000 of these per second", answer: ["What are kilometers?", "Kilometers", "Kilometer", "km"] },
        { value: 800, question: "This organelle is known as the powerhouse of the cell", answer: ["What is the mitochondria?", "Mitochondria", "The mitochondria"] },
        { value: 1000, question: "Einstein's famous equation E=mc² relates energy to this property", answer: ["What is mass?", "Mass"] },
      ]
    },
    {
      name: "HISTORY",
      questions: [
        { value: 200, question: "This war lasted from 1939 to 1945", answer: ["What is World War II?", "World War II", "WWII", "WW2", "Second World War"] },
        { value: 400, question: "He was the first President of the United States", answer: ["Who is George Washington?", "George Washington", "Washington"] },
        { value: 600, question: "The Berlin Wall fell in this year", answer: ["What is 1989?", "1989"] },
        { value: 800, question: "This Egyptian pharaoh's tomb was discovered in 1922 by Howard Carter", answer: ["Who is Tutankhamun?", "Tutankhamun", "King Tut"] },
        { value: 1000, question: "This document was signed in 1215 and limited the power of the English monarchy", answer: ["What is the Magna Carta?", "Magna Carta"] },
      ]
    },
    {
      name: "SPORTS",
      questions: [
        { value: 200, question: "This sport uses a bat and ball with bases", answer: ["What is baseball?", "Baseball"] },
        { value: 400, question: "This country hosted the 2020 Summer Olympics", answer: ["What is Japan?", "Japan"] },
        { value: 600, question: "A touchdown in American football is worth this many points", answer: ["What is 6?", "6", "Six", "Six points", "6 points"] },
        { value: 800, question: "This tennis Grand Slam is played on clay courts", answer: ["What is the French Open?", "French Open", "Roland Garros"] },
        { value: 1000, question: "Michael Jordan won 6 NBA championships with this team", answer: ["What are the Chicago Bulls?", "Chicago Bulls", "The Bulls"] },
      ]
    },
    {
      name: "LITERATURE",
      questions: [
        { value: 200, question: "He wrote Romeo and Juliet", answer: ["Who is William Shakespeare?", "William Shakespeare", "Shakespeare"] },
        { value: 400, question: "This J.K. Rowling series features a boy wizard", answer: ["What is Harry Potter?", "Harry Potter"] },
        { value: 600, question: "This George Orwell novel features Big Brother", answer: ["What is 1984?", "1984", "Nineteen Eighty-Four"] },
        { value: 800, question: "The Great Gatsby was written by this author", answer: ["Who is F. Scott Fitzgerald?", "F. Scott Fitzgerald", "Scott Fitzgerald", "Fitzgerald"] },
        { value: 1000, question: "This epic poem by Homer follows Odysseus' journey home", answer: ["What is The Odyssey?", "The Odyssey", "Odyssey"] },
      ]
    },
    {
      name: "GEOGRAPHY",
      questions: [
        { value: 200, question: "This is the largest ocean on Earth", answer: ["What is the Pacific Ocean?", "Pacific Ocean", "The Pacific"] },
        { value: 400, question: "This is the capital of France", answer: ["What is Paris?", "Paris"] },
        { value: 600, question: "This river is the longest in the world", answer: ["What is the Nile?", "The Nile", "Nile River", "Nile"] },
        { value: 800, question: "This country has the most natural lakes", answer: ["What is Canada?", "Canada"] },
        { value: 1000, question: "Mount Everest is located in this mountain range", answer: ["What are the Himalayas?", "The Himalayas", "Himalayas", "Himalaya Mountains"] },
      ]
    },
    {
      name: "MOVIES",
      questions: [
        { value: 200, question: "This 1997 movie features Jack and Rose on a sinking ship", answer: ["What is Titanic?", "Titanic"] },
        { value: 400, question: "This superhero wears a bat costume and fights crime in Gotham", answer: ["Who is Batman?", "Batman", "The Batman", "Bruce Wayne"] },
        { value: 600, question: "This animated movie features a lion cub named Simba", answer: ["What is The Lion King?", "The Lion King", "Lion King"] },
        { value: 800, question: "The Lord of the Rings movies were directed by this New Zealand filmmaker", answer: ["Who is Peter Jackson?", "Peter Jackson"] },
        { value: 1000, question: "This 1994 movie starring Tom Hanks follows a man's extraordinary life", answer: ["What is Forrest Gump?", "Forrest Gump"] }
      ]
    }
  ]
};

let gameData = { ...defaultGameData };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
// API ROUTES - ANSWER SUBMISSION
// ============================================================================

app.post('/api/submit-answer', async (req, res) => {
  try {
    const { team, player, questionValue, transcript } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript received' });
    }
    
    const room = findRoomByPlayer(player);
    if (!room || !room.currentQuestion) {
      return res.status(400).json({ error: 'No active question' });
    }
    
    const acceptableAnswers = room.currentQuestion.correctAnswer;
    const { similarity, bestMatch } = await calculateBestEmbeddingSimilarity(transcript, acceptableAnswers);
    const isCorrect = similarity >= SIMILARITY_THRESHOLD;
    
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

// ============================================================================
// API ROUTES - ROOM MANAGEMENT
// ============================================================================

app.post('/api/room', (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms.set(roomCode, createRoom(roomCode));
  res.json({ roomCode });
});

// ============================================================================
// API ROUTES - ADMIN CONFIGURATION
// ============================================================================

const configsPath = path.join(__dirname, 'configs');

if (!fs.existsSync(configsPath)) {
  fs.mkdirSync(configsPath, { recursive: true });
}

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

app.post('/api/admin/save', (req, res) => {
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

app.post('/api/admin/activate', (req, res) => {
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
  const room = rooms.get(data.roomCode);
  if (!room) return send(clientInfo.ws, 'join-error', { message: 'Room not found' });
  
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
  'use-modifier': handleUseModifier,
  'grant-modifier': handleGrantModifier,
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
