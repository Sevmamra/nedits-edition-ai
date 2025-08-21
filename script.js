document.addEventListener('DOMContentLoaded', () => {

    // CONFIGURATION & API DETAILS
    // Dhyaan dein: DeepSeek API key ab client-side code mein hai.
    // This is NOT recommended for production.
    const API_KEY = "sk-88b41f8a6dc2457c9ad1840bd210fc7b"; // Aapki asli key yahan daalen
    const API_URL = "https://api.deepseek.com/v1/chat/completions";
    const MODEL_NAME = "deepseek-chat";
    let SYSTEM_PROMPT = '';

    // DOM ELEMENT REFERENCES
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatHistoryEl = document.getElementById('chat-history');
    const messageListEl = document.getElementById('message-list');
    const emptyStateEl = document.getElementById('empty-state');
    const promptSuggestionsEl = document.getElementById('prompt-suggestions');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const mobileOverlay = document.getElementById('mobile-overlay');

    // STATE MANAGEMENT
    let chats = {};
    let activeChatId = null;

    // FUNCTIONS
    async function loadConfig() {
        try {
            const response = await fetch('prompt.json');
            if (!response.ok) throw new Error('Could not load prompt.json');
            const data = await response.json();
            SYSTEM_PROMPT = data.system_prompt;
            renderPromptSuggestions(data.suggestions);
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    function renderPromptSuggestions(suggestions) {
        promptSuggestionsEl.innerHTML = '';
        suggestions.forEach(s => {
            const card = document.createElement('div');
            card.className = 'suggestion-card';
            card.textContent = s.text;
            card.dataset.prompt = s.prompt;
            promptSuggestionsEl.appendChild(card);
        });
    }

    function saveState() {
        localStorage.setItem('nedits_ai_chats', JSON.stringify(chats));
        localStorage.setItem('nedits_ai_active_chat', activeChatId);
    }

    function loadState() {
        const savedChats = JSON.parse(localStorage.getItem('nedits_ai_chats'));
        const savedActiveId = localStorage.getItem('nedits_ai_active_chat');
        
        if (savedChats) { chats = savedChats; }

        if (savedActiveId && chats[savedActiveId]) {
            activeChatId = savedActiveId;
        } else if (Object.keys(chats).length > 0) {
            activeChatId = Object.keys(chats).sort((a,b) => b-a)[0];
        } else {
            startNewChat();
        }
    }

    function renderSidebar() {
        chatHistoryEl.innerHTML = '';
        const sortedChatIds = Object.keys(chats).sort((a, b) => b - a);

        sortedChatIds.forEach(chatId => {
            const chat = chats[chatId];
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-history-item';
            chatItem.dataset.chatId = chatId;

            const title = document.createElement('span');
            title.className = 'chat-title';
            title.textContent = chat.title;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-chat-btn';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            deleteBtn.dataset.chatId = chatId;

            chatItem.appendChild(title);
            chatItem.appendChild(deleteBtn);

            if (chatId === activeChatId) {
                chatItem.classList.add('active');
            }
            chatHistoryEl.appendChild(chatItem);
        });
    }

    function renderActiveChat() {
        messageListEl.innerHTML = '';
        const chatContainer = messageListEl.parentElement;
        if (activeChatId && chats[activeChatId] && chats[activeChatId].messages.length > 0) {
            emptyStateEl.style.display = 'none';
            chats[activeChatId].messages.forEach(msg => addBubble(msg.role, msg.content));
        } else {
            emptyStateEl.style.display = 'flex';
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function addBubble(role, content) {
        const bubble = document.createElement('div');
        bubble.className = `bubble ${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${role}`;
        if (role === 'user') {
            avatar.textContent = 'You';
        }

        const msg = document.createElement('div');
        msg.className = 'msg';
        
        msg.innerHTML = marked.parse(content);
        
        msg.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        bubble.appendChild(avatar);
        bubble.appendChild(msg);
        messageListEl.appendChild(bubble);
        
        messageListEl.parentElement.scrollTop = messageListEl.parentElement.scrollHeight;

        return msg;
    }

    function startNewChat() {
        const newChatId = Date.now().toString();
        chats[newChatId] = {
            title: 'New Conversation',
            messages: []
        };
        activeChatId = newChatId;
        renderActiveChat();
        renderSidebar();
        saveState();
        if (window.innerWidth <= 768) {
            toggleSidebar();
        }
    }
    
    function switchChat(chatId) {
        activeChatId = chatId;
        renderActiveChat();
        renderSidebar();
        saveState();
        if (window.innerWidth <= 768) {
            toggleSidebar();
        }
    }

    function deleteChat(chatIdToDelete) {
        if (confirm('Are you sure you want to delete this chat history?')) {
            delete chats[chatIdToDelete];
            
            if (activeChatId === chatIdToDelete) {
                const remainingChats = Object.keys(chats).sort((a,b) => b-a);
                if(remainingChats.length > 0) {
                    switchChat(remainingChats[0]);
                } else {
                    startNewChat();
                }
            }
            saveState();
            renderSidebar();
        }
    }

    async function sendMessage(userInput) {
        if (!userInput || !activeChatId) return;

        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        emptyStateEl.style.display = 'none';

        addBubble('user', userInput);
        chats[activeChatId].messages.push({ role: 'user', content: userInput });

        if (chats[activeChatId].messages.length === 1) {
            chats[activeChatId].title = userInput.substring(0, 30) + (userInput.length > 30 ? '...' : '');
            renderSidebar();
        }

        const aiMsgElement = addBubble('ai', '<span class="typing"></span>');
        let fullResponse = '';

        try {
            const historyForAPI = chats[activeChatId].messages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }));
            
            // System prompt ko conversation ke shuru mein add karein
            historyForAPI.unshift({
                role: 'system',
                content: SYSTEM_PROMPT
            });

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: historyForAPI,
                    stream: false // Streaming ko off rakha hai
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.message}`);
            }

            const data = await response.json();
            fullResponse = data.choices[0].message.content;

            aiMsgElement.innerHTML = marked.parse(fullResponse);
            aiMsgElement.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
            
            chats[activeChatId].messages.push({ role: 'ai', content: fullResponse });

        } catch (error) {
            console.error('Error during API call:', error);
            aiMsgElement.innerHTML = `Oops! I couldn't process your request right now. This is a common issue with front-end API calls due to security policies. The most reliable solution is to use a server-side proxy. If the issue persists, you can contact us directly at <a href="mailto:neditsedition@gmail.com">neditsedition@gmail.com</a>.`;
        } finally {
            sendBtn.disabled = false;
            saveState();
            const typingSpan = aiMsgElement.querySelector('.typing');
            if(typingSpan) typingSpan.remove();
        }
    }

    // EVENT LISTENERS
    sendBtn.addEventListener('click', () => sendMessage(inputEl.value.trim()));
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputEl.value.trim());
        }
    });

    newChatBtn.addEventListener('click', startNewChat);

    chatHistoryEl.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-chat-btn');
        if (deleteButton) {
            e.stopPropagation();
            const chatId = deleteButton.dataset.chatId;
            deleteChat(chatId);
            return;
        }

        const chatItem = e.target.closest('.chat-history-item');
        if (chatItem) {
            const chatId = chatItem.dataset.chatId;
            switchChat(chatId);
        }
    });

    promptSuggestionsEl.addEventListener('click', (e) => {
        const card = e.target.closest('.suggestion-card');
        if (card) {
            sendMessage(card.dataset.prompt);
        }
    });

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.dataset.theme !== 'light';
        if (isDark) {
            document.documentElement.dataset.theme = 'light';
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('nedits_ai_theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('nedits_ai_theme', 'dark');
        }
    });

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        mobileOverlay.classList.toggle('active');
    }
    menuBtn.addEventListener('click', toggleSidebar);
    mobileOverlay.addEventListener('click', toggleSidebar);
    
    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = `${inputEl.scrollHeight}px`;
    });

    // INITIALIZATION
    if (localStorage.getItem('nedits_ai_theme') === 'light') {
        document.documentElement.dataset.theme = 'light';
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    loadConfig().then(() => {
        loadState();
        renderSidebar();
        renderActiveChat();
    });
});
