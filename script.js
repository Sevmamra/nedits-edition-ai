document.addEventListener('DOMContentLoaded', () => {

    // CONFIGURATION & API DETAILS
    const API_KEY = "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"; // Replace this with your actual Groq API key
    const MODEL_NAME = "llama3-8b-8192"; // Recommended model for Groq
    const API_URL = "https://api.groq.com/openai/v1/chat/completions";
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
    const chatSearchEl = document.getElementById('chat-search');
    const instructionsBtn = document.getElementById('instructions-btn');
    const instructionsModal = document.getElementById('instructions-modal');
    const closeInstructions = document.getElementById('close-instructions');
    const cancelInstructions = document.getElementById('cancel-instructions');
    const saveInstructions = document.getElementById('save-instructions');
    const instructionsText = document.getElementById('instructions-text');
    const exportBtn = document.getElementById('export-btn');
    const exportModal = document.getElementById('export-modal');
    const closeExport = document.getElementById('close-export');
    const exportOptions = document.querySelectorAll('.export-option');
    const voiceInputBtn = document.getElementById('voice-input-btn');
    const stopContainer = document.getElementById('stop-container');
    const stopBtn = document.getElementById('stop-btn');
    const attachBtn = document.getElementById('attach-btn');

    // STATE MANAGEMENT
    let chats = {};
    let activeChatId = null;
    let isListening = false;
    let recognition = null;
    let abortController = null;
    let CUSTOM_INSTRUCTIONS = '';

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
            // Fallback suggestions if JSON fails to load
            renderPromptSuggestions([
                { text: "Explain all services of Nedits Edition", prompt: "Explain all services of Nedits Edition in detail." },
                { text: "Help me with video editing", prompt: "I need help with video editing for my YouTube channel." },
                { text: "I want to build a website", prompt: "I want to build a website for my business. Can you help?" }
            ]);
        }
    }

    function renderPromptSuggestions(suggestions) {
        promptSuggestionsEl.innerHTML = '';
        suggestions.forEach(s => {
            const card = document.createElement('div');
            card.className = 'suggestion-card';
            card.innerHTML = `
                <div class="suggestion-icon">💡</div>
                <div class="suggestion-text">${s.text}</div>
            `;
            card.dataset.prompt = s.prompt;
            promptSuggestionsEl.appendChild(card);
        });
    }

    function saveState() {
        localStorage.setItem('nedits_ai_chats', JSON.stringify(chats));
        localStorage.setItem('nedits_ai_active_chat', activeChatId);
        if (CUSTOM_INSTRUCTIONS) {
            localStorage.setItem('nedits_ai_instructions', CUSTOM_INSTRUCTIONS);
        }
    }

    function loadState() {
        const savedChats = JSON.parse(localStorage.getItem('nedits_ai_chats'));
        const savedActiveId = localStorage.getItem('nedits_ai_active_chat');
        const savedInstructions = localStorage.getItem('nedits_ai_instructions');
        
        if (savedChats) { chats = savedChats; }
        if (savedInstructions) { 
            CUSTOM_INSTRUCTIONS = savedInstructions;
            instructionsText.value = CUSTOM_INSTRUCTIONS;
        }

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

        // Apply search filter if any
        applySearchFilter();
    }

    function applySearchFilter() {
        const searchTerm = chatSearchEl.value.toLowerCase();
        const chatItems = chatHistoryEl.querySelectorAll('.chat-history-item');
        
        chatItems.forEach(item => {
            const title = item.querySelector('.chat-title').textContent.toLowerCase();
            if (searchTerm === '' || title.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
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
        } else {
            avatar.textContent = 'AI';
        }

        const msg = document.createElement('div');
        msg.className = 'msg';
        
        // Parse markdown and add copy buttons to code blocks
        msg.innerHTML = marked.parse(content);
        
        // Add copy buttons to code blocks
        msg.querySelectorAll('pre').forEach((preElement) => {
            const codeBlock = preElement.querySelector('code');
            if (codeBlock) {
                const copyButton = document.createElement('button');
                copyButton.className = 'code-copy-btn';
                copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
                copyButton.title = 'Copy code';
                copyButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeBlock.textContent)
                        .then(() => {
                            copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
                            setTimeout(() => {
                                copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
                            }, 2000);
                        });
                });
                preElement.appendChild(copyButton);
                
                hljs.highlightElement(codeBlock);
            }
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

    function showStopButton() {
        stopContainer.style.display = 'flex';
    }

    function hideStopButton() {
        stopContainer.style.display = 'none';
    }

    async function sendMessage(userInput) {
        if (!userInput || !activeChatId) return;

        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;
        hideStopButton();

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
            // Prepare messages for API
            const historyForAPI = chats[activeChatId].messages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }));
            
            // Add system prompt and custom instructions
            let finalSystemPrompt = SYSTEM_PROMPT;
            if (CUSTOM_INSTRUCTIONS) {
                finalSystemPrompt += `\n\nADDITIONAL USER INSTRUCTIONS:\n${CUSTOM_INSTRUCTIONS}`;
            }
            
            historyForAPI.unshift({
                role: 'system',
                content: finalSystemPrompt
            });

            // Create abort controller for stopping generation
            abortController = new AbortController();
            showStopButton();

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: historyForAPI,
                    stream: false
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error.message}`);
            }

            const data = await response.json();
            fullResponse = data.choices[0].message.content;

            aiMsgElement.innerHTML = marked.parse(fullResponse);
            
            // Add copy buttons to code blocks in the response
            aiMsgElement.querySelectorAll('pre').forEach((preElement) => {
                const codeBlock = preElement.querySelector('code');
                if (codeBlock) {
                    const copyButton = document.createElement('button');
                    copyButton.className = 'code-copy-btn';
                    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
                    copyButton.title = 'Copy code';
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(codeBlock.textContent)
                            .then(() => {
                                copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
                                setTimeout(() => {
                                    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
                                }, 2000);
                            });
                    });
                    preElement.appendChild(copyButton);
                    
                    hljs.highlightElement(codeBlock);
                }
            });
            
            chats[activeChatId].messages.push({ role: 'ai', content: fullResponse });

        } catch (error) {
            if (error.name === 'AbortError') {
                aiMsgElement.innerHTML = '<em>Response stopped by user.</em>';
            } else {
                console.error('Error during API call:', error);
                aiMsgElement.innerHTML = `Oops! I couldn't process your request right now. Error: ${error.message}. Please try again or contact us at <a href="mailto:neditsedition@gmail.com">neditsedition@gmail.com</a>.`;
            }
        } finally {
            sendBtn.disabled = false;
            hideStopButton();
            abortController = null;
            saveState();
            const typingSpan = aiMsgElement.querySelector('.typing');
            if(typingSpan) typingSpan.remove();
        }
    }

    function stopGeneration() {
        if (abortController) {
            abortController.abort();
            hideStopButton();
        }
    }

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        mobileOverlay.classList.toggle('active');
    }

    function toggleModal(modal) {
        modal.classList.toggle('active');
    }

    function initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isListening = true;
                voiceInputBtn.classList.add('listening');
                voiceInputBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
                voiceInputBtn.title = 'Stop listening';
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                inputEl.value = transcript;
                inputEl.style.height = 'auto';
                inputEl.style.height = `${inputEl.scrollHeight}px`;
            };

            recognition.onend = () => {
                isListening = false;
                voiceInputBtn.classList.remove('listening');
                voiceInputBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                voiceInputBtn.title = 'Voice Input';
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                isListening = false;
                voiceInputBtn.classList.remove('listening');
                voiceInputBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                voiceInputBtn.title = 'Voice Input';
                
                if (event.error === 'not-allowed') {
                    alert('Microphone access is blocked. Please allow microphone access in your browser settings.');
                }
            };
        } else {
            voiceInputBtn.style.display = 'none';
        }
    }

    function toggleVoiceInput() {
        if (!recognition) return;

        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }

    function exportChat(format) {
        if (!activeChatId || !chats[activeChatId]) return;

        const chat = chats[activeChatId];
        let content = `Nedits AI Conversation - ${chat.title}\n\n`;
        
        chat.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : 'Nedits AI';
            content += `${role}: ${msg.content}\n\n`;
        });

        const filename = `nedits-ai-chat-${activeChatId}`;

        switch(format) {
            case 'text':
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                break;

            case 'pdf':
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                
                doc.setFontSize(16);
                doc.text(`Nedits AI Conversation - ${chat.title}`, 10, 10);
                doc.setFontSize(10);
                
                const splitContent = doc.splitTextToSize(content, 180);
                doc.text(splitContent, 10, 20);
                
                doc.save(`${filename}.pdf`);
                break;

            case 'image':
                html2canvas(messageListEl).then(canvas => {
                    const imgData = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.href = imgData;
                    link.download = `${filename}.png`;
                    link.click();
                });
                break;
        }

        toggleModal(exportModal);
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed: ', err));
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

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = `${inputEl.scrollHeight}px`;
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

    chatSearchEl.addEventListener('input', applySearchFilter);

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

    instructionsBtn.addEventListener('click', () => toggleModal(instructionsModal));
    closeInstructions.addEventListener('click', () => toggleModal(instructionsModal));
    cancelInstructions.addEventListener('click', () => toggleModal(instructionsModal));
    saveInstructions.addEventListener('click', () => {
        CUSTOM_INSTRUCTIONS = instructionsText.value.trim();
        saveState();
        toggleModal(instructionsModal);
    });

    exportBtn.addEventListener('click', () => toggleModal(exportModal));
    closeExport.addEventListener('click', () => toggleModal(exportModal));
    exportOptions.forEach(option => {
        option.addEventListener('click', () => {
            exportChat(option.dataset.format);
        });
    });

    voiceInputBtn.addEventListener('click', toggleVoiceInput);
    
    stopBtn.addEventListener('click', stopGeneration);

    menuBtn.addEventListener('click', toggleSidebar);
    mobileOverlay.addEventListener('click', toggleSidebar);

    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (instructionsModal.classList.contains('active') && 
            e.target === instructionsModal) {
            toggleModal(instructionsModal);
        }
        if (exportModal.classList.contains('active') && 
            e.target === exportModal) {
            toggleModal(exportModal);
        }
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
        initVoiceRecognition();
        registerServiceWorker();
    });
});
