// ── Chat Tab – Chat Interface ─────────────────────────────────────
import { bus, $, createElement } from './utils.js';
import { addTab } from './tabs.js';

const panel = $('#chat-panel');

let ws = null;
let messages = [];       // { role: 'user'|'assistant', content: string }
let isStreaming = false;

// DOM refs
let chatMessages, chatInput, sendBtn, typingIndicator;

export function init() {
  if (!panel) return;
  buildUI();
  connectWS();

  bus.on('tab:changed', (tabId) => {
    if (tabId === 'chat') {
      chatInput.focus();
      scrollToBottom();
    }
  });
}

function buildUI() {
  panel.innerHTML = '';

  // Welcome hero
  const hero = createElement('div', { className: 'chat-hero' });
  hero.innerHTML = `
    <div class="chat-hero__icon">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="16" fill="url(#grad)"/>
        <defs><linearGradient id="grad" x1="0" y1="0" x2="48" y2="48">
          <stop stop-color="#00f0ff"/><stop offset="1" stop-color="#bf5af2"/>
        </linearGradient></defs>
        <path d="M16 20a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-3l-3 3-3-3h-3a2 2 0 01-2-2v-8z" fill="rgba(255,255,255,0.9)"/>
      </svg>
    </div>
    <h1 class="chat-hero__title">Builder</h1>
    <p class="chat-hero__subtitle">Tell me what you need and I'll build it.</p>
  `;

  // Messages area
  chatMessages = createElement('div', { className: 'chat-messages', id: 'chat-messages' });

  // Typing indicator
  typingIndicator = createElement('div', { className: 'chat-typing', id: 'chat-typing' });
  typingIndicator.hidden = true;
  typingIndicator.innerHTML = `
    <div class="chat-typing__dots">
      <span></span><span></span><span></span>
    </div>
  `;

  // Input bar
  const inputBar = createElement('div', { className: 'chat-input-bar' });
  chatInput = createElement('textarea', {
    className: 'chat-input-bar__input',
    placeholder: 'Describe a tab or tool to build...',
    rows: 1,
  });
  sendBtn = createElement('button', {
    className: 'chat-input-bar__send',
    innerHTML: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 10l14-7-4 7 4 7L3 10z" fill="currentColor"/>
    </svg>`,
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener('input', autoResize);
  sendBtn.addEventListener('click', sendMessage);

  inputBar.appendChild(chatInput);
  inputBar.appendChild(sendBtn);

  // Assemble
  const chatContainer = createElement('div', { className: 'chat-container' });
  chatContainer.appendChild(hero);
  chatContainer.appendChild(inputBar);
  chatContainer.appendChild(chatMessages);
  chatContainer.appendChild(typingIndicator);

  panel.appendChild(chatContainer);
}

function autoResize() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/api/chat/ws`);

  ws.onclose = () => {
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'delta') {
      appendToAssistant(data.text);
    } else if (data.type === 'tool_use') {
      showToolUse(data.name, data.input);
    } else if (data.type === 'create_tab') {
      addTab(data.tab_id, data.label, data.html);
    } else if (data.type === 'done') {
      finishStreaming();
    } else if (data.type === 'error') {
      appendToAssistant(`\n\n**Error:** ${data.text}`);
      finishStreaming();
    }
  };
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  // Add user message
  messages.push({ role: 'user', content: text });
  renderUserMessage(text);
  chatInput.value = '';
  autoResize();

  // Hide hero after first message
  const hero = panel.querySelector('.chat-hero');
  if (hero) hero.classList.add('chat-hero--hidden');

  // Start streaming
  isStreaming = true;
  sendBtn.disabled = true;
  typingIndicator.hidden = false;
  scrollToBottom();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ messages }));
  }
}

function renderUserMessage(text) {
  const bubble = createElement('div', { className: 'chat-bubble chat-bubble--user' });
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  scrollToBottom();
}

let currentAssistantBubble = null;
let currentAssistantText = '';

function appendToAssistant(text) {
  typingIndicator.hidden = true;

  if (!currentAssistantBubble) {
    currentAssistantBubble = createElement('div', { className: 'chat-bubble chat-bubble--assistant' });
    currentAssistantBubble.innerHTML = '';
    chatMessages.appendChild(currentAssistantBubble);
    currentAssistantText = '';
  }

  currentAssistantText += text;
  currentAssistantBubble.innerHTML = renderMarkdown(currentAssistantText);
  scrollToBottom();
}

function showToolUse(name, input) {
  // Show the working indicator (replaces verbose tool text)
  typingIndicator.hidden = false;
  scrollToBottom();
}

function finishStreaming() {
  isStreaming = false;
  sendBtn.disabled = false;
  typingIndicator.hidden = true;

  if (currentAssistantText) {
    messages.push({ role: 'assistant', content: currentAssistantText });
  }
  currentAssistantBubble = null;
  currentAssistantText = '';
  chatInput.focus();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// Simple markdown renderer (bold, italic, code, code blocks, links)
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
    '<pre class="chat-code"><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
