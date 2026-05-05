// Admin interface for Jeopardy game configuration
let gameConfig = {
  categories: [],
  numCategories: 6,
  numQuestions: 5,
  startValue: 200,
  valueStep: 200
};

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentConfig();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('save-btn').addEventListener('click', saveConfiguration);
  document.getElementById('load-btn').addEventListener('click', loadDefaultConfig);
  document.getElementById('export-btn').addEventListener('click', exportConfig);
  document.getElementById('import-btn').addEventListener('click', showImportModal);
  document.getElementById('confirm-import').addEventListener('click', importConfig);
  document.getElementById('cancel-import').addEventListener('click', hideImportModal);
  document.getElementById('apply-board-btn').addEventListener('click', applyBoardSettings);
  document.getElementById('add-category-btn').addEventListener('click', addCategory);
  
  // Board settings inputs
  ['num-categories', 'num-questions', 'start-value', 'value-step'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateBoardSettings);
  });
}

async function loadCurrentConfig() {
  try {
    const response = await fetch('/api/game');
    const data = await response.json();
    gameConfig.categories = data.categories || [];
    renderCategories();
    loadSavedConfigs();
  } catch (err) {
    console.error('Failed to load config:', err);
    showError('Failed to load current configuration');
  }
}

function renderCategories() {
  const container = document.getElementById('categories-container');
  container.innerHTML = '';
  
  gameConfig.categories.forEach((category, catIndex) => {
    const categoryEl = createCategoryElement(category, catIndex);
    container.appendChild(categoryEl);
  });
}

function createCategoryElement(category, catIndex) {
  const div = document.createElement('div');
  div.className = 'category-editor';
  div.dataset.index = catIndex;
  
  div.innerHTML = `
    <div class="category-header">
      <input type="text" class="category-name-input" value="${escapeHtml(category.name)}" 
             placeholder="Category Name" data-field="name">
      <button class="btn delete-btn" data-action="delete-category">Delete</button>
    </div>
    <div class="questions-list">
      ${category.questions.map((q, qIndex) => createQuestionHtml(q, catIndex, qIndex)).join('')}
    </div>
    <button class="btn add-question-btn" data-action="add-question">Add Question</button>
  `;
  
  // Add event listeners
  div.querySelector('.category-name-input').addEventListener('change', (e) => {
    gameConfig.categories[catIndex].name = e.target.value;
  });
  
  div.querySelector('[data-action="delete-category"]').addEventListener('click', () => {
    deleteCategory(catIndex);
  });
  
  div.querySelector('[data-action="add-question"]').addEventListener('click', () => {
    addQuestion(catIndex);
  });
  
  // Question inputs (question text only)
  div.querySelectorAll('.question-text-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const qIndex = parseInt(e.target.dataset.qindex);
      gameConfig.categories[catIndex].questions[qIndex].question = e.target.value;
    });
  });
  
  // Question value inputs
  div.querySelectorAll('.question-value-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const qIndex = parseInt(e.target.dataset.qindex);
      gameConfig.categories[catIndex].questions[qIndex].value = parseInt(e.target.value) || 0;
    });
  });
  
  // Answer inputs - collect all answers into array
  div.querySelectorAll('.answers-list').forEach(answersList => {
    const qIndex = parseInt(answersList.dataset.qindex);
    const answerInputs = answersList.querySelectorAll('.answer-text-input');
    
    answerInputs.forEach(input => {
      input.addEventListener('change', () => {
        const answers = [];
        answersList.querySelectorAll('.answer-text-input').forEach(inp => {
          if (inp.value.trim()) answers.push(inp.value.trim());
        });
        gameConfig.categories[catIndex].questions[qIndex].answer = answers;
      });
    });
  });
  
  // Delete question buttons
  div.querySelectorAll('[data-action="delete-question"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qIndex = parseInt(e.target.dataset.qindex);
      deleteQuestion(catIndex, qIndex);
    });
  });
  
  // Add answer buttons
  div.querySelectorAll('[data-action="add-answer"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qIndex = parseInt(e.target.dataset.qindex);
      addAnswer(catIndex, qIndex);
    });
  });
  
  // Delete answer buttons
  div.querySelectorAll('[data-action="delete-answer"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qIndex = parseInt(e.target.dataset.qindex);
      const aIndex = parseInt(e.target.dataset.aindex);
      deleteAnswer(catIndex, qIndex, aIndex);
    });
  });
  
  return div;
}

function addAnswer(catIndex, qIndex) {
  const question = gameConfig.categories[catIndex].questions[qIndex];
  const answers = Array.isArray(question.answer) ? question.answer : [question.answer || ''];
  answers.push('');
  question.answer = answers;
  renderCategories();
}

function deleteAnswer(catIndex, qIndex, aIndex) {
  const question = gameConfig.categories[catIndex].questions[qIndex];
  let answers = Array.isArray(question.answer) ? question.answer : [question.answer || ''];
  answers.splice(aIndex, 1);
  if (answers.length === 0) answers.push('');
  question.answer = answers;
  renderCategories();
}

function createQuestionHtml(question, catIndex, qIndex) {
  // Handle both string and array formats for backward compatibility
  const answers = Array.isArray(question.answer) ? question.answer : [question.answer || ''];
  
  return `
    <div class="question-editor" data-qindex="${qIndex}">
      <div class="question-row">
        <input type="number" class="question-value-input" value="${question.value}" 
               data-catindex="${catIndex}" data-qindex="${qIndex}" data-field="value">
      </div>
      <div class="question-row">
        <input type="text" class="question-input question-text-input" 
               value="${escapeHtml(question.question)}" placeholder="Question"
               data-catindex="${catIndex}" data-qindex="${qIndex}" data-field="question">
      </div>
      <div class="answers-section">
        <label>Acceptable Answers:</label>
        <div class="answers-list" data-qindex="${qIndex}">
          ${answers.map((ans, aIndex) => createAnswerInputHtml(ans, catIndex, qIndex, aIndex)).join('')}
        </div>
        <button class="btn add-answer-btn" data-action="add-answer" data-qindex="${qIndex}">+ Add Alternative Answer</button>
      </div>
      <button class="btn delete-btn" data-action="delete-question" data-qindex="${qIndex}">Delete</button>
    </div>
  `;
}

function createAnswerInputHtml(answer, catIndex, qIndex, aIndex) {
  return `
    <div class="answer-row" data-aindex="${aIndex}">
      <input type="text" class="question-input answer-text-input" 
             value="${escapeHtml(answer || '')}" placeholder="Answer (e.g., What is...?)"
             data-catindex="${catIndex}" data-qindex="${qIndex}" data-aindex="${aIndex}">
      <button class="btn delete-btn small" data-action="delete-answer" data-qindex="${qIndex}" data-aindex="${aIndex}">×</button>
    </div>
  `;
}

function addCategory() {
  const numQuestions = parseInt(document.getElementById('num-questions').value) || 5;
  const startValue = parseInt(document.getElementById('start-value').value) || 200;
  const valueStep = parseInt(document.getElementById('value-step').value) || 200;
  
  const newCategory = {
    name: 'New Category',
    questions: Array(numQuestions).fill(null).map((_, i) => ({
      value: startValue + (i * valueStep),
      question: '',
      answer: ''
    }))
  };
  
  gameConfig.categories.push(newCategory);
  renderCategories();
}

function deleteCategory(index) {
  if (confirm('Delete this category and all its questions?')) {
    gameConfig.categories.splice(index, 1);
    renderCategories();
  }
}

function addQuestion(catIndex) {
  const lastQ = gameConfig.categories[catIndex].questions[gameConfig.categories[catIndex].questions.length - 1];
  const valueStep = parseInt(document.getElementById('value-step').value) || 200;
  
  gameConfig.categories[catIndex].questions.push({
    value: lastQ ? lastQ.value + valueStep : 200,
    question: '',
    answer: ''
  });
  renderCategories();
}

function deleteQuestion(catIndex, qIndex) {
  gameConfig.categories[catIndex].questions.splice(qIndex, 1);
  renderCategories();
}

function updateBoardSettings() {
  gameConfig.numCategories = parseInt(document.getElementById('num-categories').value) || 6;
  gameConfig.numQuestions = parseInt(document.getElementById('num-questions').value) || 5;
  gameConfig.startValue = parseInt(document.getElementById('start-value').value) || 200;
  gameConfig.valueStep = parseInt(document.getElementById('value-step').value) || 200;
}

function applyBoardSettings() {
  updateBoardSettings();
  
  // Rebuild categories to match new dimensions
  const currentCategories = [...gameConfig.categories];
  const numCategories = gameConfig.numCategories;
  const numQuestions = gameConfig.numQuestions;
  
  gameConfig.categories = Array(numCategories).fill(null).map((_, catIndex) => {
    const existingCategory = currentCategories[catIndex] || { name: 'New Category', questions: [] };
    
    const questions = Array(numQuestions).fill(null).map((_, qIndex) => {
      return existingCategory.questions[qIndex] || {
        value: gameConfig.startValue + (qIndex * gameConfig.valueStep),
        question: '',
        answer: ''
      };
    });
    
    return {
      name: existingCategory.name,
      questions
    };
  });
  
  renderCategories();
}

async function saveConfiguration() {
  const configName = prompt('Enter a name for this configuration:');
  if (!configName) return;
  
  try {
    const response = await fetch('/api/admin/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: configName,
        config: { categories: gameConfig.categories }
      })
    });
    
    if (response.ok) {
      showSuccess('Configuration saved!');
      loadSavedConfigs();
    } else {
      throw new Error('Save failed');
    }
  } catch (err) {
    console.error('Failed to save:', err);
    showError('Failed to save configuration');
  }
}

async function loadSavedConfigs() {
  try {
    const response = await fetch('/api/admin/configs');
    const configs = await response.json();
    
    const container = document.getElementById('saved-configs');
    container.innerHTML = '';
    
    configs.forEach(config => {
      const div = document.createElement('div');
      div.className = 'config-item';
      div.innerHTML = `
        <span class="config-name">${escapeHtml(config.name)}</span>
        <div class="config-actions">
          <button class="btn primary" data-action="activate" data-name="${escapeHtml(config.name)}">Set Active</button>
          <button class="btn" data-action="load" data-name="${escapeHtml(config.name)}">Edit</button>
          <button class="btn delete-btn" data-action="delete" data-name="${escapeHtml(config.name)}">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });
    
    // Add event listeners
    container.querySelectorAll('[data-action="activate"]').forEach(btn => {
      btn.addEventListener('click', () => activateConfig(btn.dataset.name));
    });
    
    container.querySelectorAll('[data-action="load"]').forEach(btn => {
      btn.addEventListener('click', () => loadConfig(btn.dataset.name));
    });
    
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteSavedConfig(btn.dataset.name));
    });
  } catch (err) {
    console.error('Failed to load saved configs:', err);
  }
}

async function loadConfig(name) {
  try {
    const response = await fetch(`/api/admin/config/${encodeURIComponent(name)}`);
    const data = await response.json();
    
    if (data.config) {
      gameConfig.categories = data.config.categories;
      renderCategories();
      showSuccess(`Loaded "${name}" for editing`);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
    showError('Failed to load configuration');
  }
}

async function activateConfig(name) {
  try {
    const response = await fetch('/api/admin/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    if (response.ok) {
      showSuccess(`"${name}" is now the active game configuration!`);
    } else {
      throw new Error('Activation failed');
    }
  } catch (err) {
    console.error('Failed to activate config:', err);
    showError('Failed to activate configuration');
  }
}

async function deleteSavedConfig(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  
  try {
    await fetch(`/api/admin/config/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadSavedConfigs();
  } catch (err) {
    console.error('Failed to delete config:', err);
  }
}

async function loadDefaultConfig() {
  try {
    const response = await fetch('/api/admin/default');
    const data = await response.json();
    gameConfig.categories = data.categories;
    renderCategories();
    showSuccess('Default configuration loaded');
  } catch (err) {
    console.error('Failed to load default:', err);
    showError('Failed to load default configuration');
  }
}

function exportConfig() {
  const json = JSON.stringify({ categories: gameConfig.categories }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jeopardy-config.json';
  a.click();
  
  URL.revokeObjectURL(url);
}

function showImportModal() {
  document.getElementById('import-modal').classList.remove('hidden');
}

function hideImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('import-json').value = '';
}

function importConfig() {
  const json = document.getElementById('import-json').value.trim();
  if (!json) {
    showError('Please paste JSON data');
    return;
  }
  
  try {
    const data = JSON.parse(json);
    if (!data.categories || !Array.isArray(data.categories)) {
      throw new Error('Invalid format: must have "categories" array');
    }
    
    gameConfig.categories = data.categories;
    renderCategories();
    hideImportModal();
    showSuccess('Configuration imported');
  } catch (err) {
    showError('Invalid JSON: ' + err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccess(message) {
  showToast(message, 'success');
}

function showError(message) {
  showToast(message, 'error');
}

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}
