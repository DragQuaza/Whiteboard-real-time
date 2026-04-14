const SERVER_URL = 'http://localhost:5001';

let socket = null;
let roomId = null;
let userName = 'Anonymous';
let currentTool = 'pencil';
let currentColor = '#ffffff';
let canvasColor = '#131313';
let strokeWidth = 5;
let elements = [];
let history = [];
let isDrawing = false;
let currentElement = null;
let isLive = false;
let messages = [];

const generator = rough.generator();

function init() {
    const path = window.location.pathname;
    if (path.startsWith('/room/')) {
        roomId = path.split('/room/')[1];
        initRoom();
    } else {
        initLanding();
    }
}

function initLanding() {
    document.getElementById('landing-page').classList.remove('hidden');
    document.getElementById('room-page').classList.add('hidden');
    
    document.getElementById('start-session-btn').addEventListener('click', startNewSession);
    
    const createBtn = document.getElementById('create-session-btn');
    if (createBtn) {
        createBtn.addEventListener('click', startNewSession);
    }
}

function startNewSession() {
    roomId = generateRoomId();
    window.location.href = `/room/${roomId}`;
}

function initRoom() {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('room-page').classList.remove('hidden');
    
    initCanvas();
    initTools();
    initColorPicker();
    initUndoRedo();
    initMenu();
    initSessionModal();
    initChat();
    initSidebar();
    
    userName = localStorage.getItem('userName') || 'Anonymous';
    document.getElementById('username-input').value = userName;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('live') === 'true') {
        isLive = true;
        connectSocket();
    }

    // Load from Firestore
    if (window.getCanvasFromFirestore) {
        window.getCanvasFromFirestore(roomId).then(data => {
            if (data) {
                elements = data.elements || [];
                canvasColor = data.canvasColor || '#131313';
                updateCanvas();
                showToast('Canvas restored from Cloud');
            }
        });
    }
}

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 20; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function initCanvas() {
    const canvas = document.getElementById('board');
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleMouseUp);
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth * 2;
        canvas.height = window.innerHeight * 2;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.scale(2, 2);
        redrawCanvas();
    });
}

function getOffset(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }
    return {
        x: e.offsetX,
        y: e.offsetY
    };
}

function handleMouseDown(e) {
    isDrawing = true;
    const { x, y } = getOffset(e, e.target);
    
    if (currentTool === 'pencil') {
        currentElement = {
            offsetX: x,
            offsetY: y,
            path: [[x, y]],
            stroke: currentColor,
            element: currentTool,
            strokeWidth: strokeWidth
        };
    } else if (currentTool === 'eraser') {
        currentElement = {
            offsetX: x,
            offsetY: y,
            path: [[x, y]],
            stroke: canvasColor,
            element: currentTool,
            strokeWidth: strokeWidth > 30 ? strokeWidth : 30
        };
    } else {
        currentElement = {
            offsetX: x,
            offsetY: y,
            stroke: currentColor,
            element: currentTool,
            strokeWidth: strokeWidth
        };
    }
    
    elements.push(currentElement);
    updateCanvas();
}

function handleMouseMove(e) {
    const canvas = document.getElementById('board');
    const { x, y } = getOffset(e, canvas);
    
    if (currentTool === 'eraser') {
        const eraserCursor = document.getElementById('eraser-cursor');
        eraserCursor.style.left = (e.clientX - parseInt(eraserCursor.style.width || strokeWidth) / 2) + 'px';
        eraserCursor.style.top = (e.clientY - parseInt(eraserCursor.style.height || strokeWidth) / 2) + 'px';
        eraserCursor.style.width = strokeWidth + 'px';
        eraserCursor.style.height = strokeWidth + 'px';
    }
    
    if (!isDrawing || !currentElement) return;
    
    if (currentTool === 'rect') {
        currentElement.width = x - currentElement.offsetX;
        currentElement.height = y - currentElement.offsetY;
    } else if (currentTool === 'line') {
        currentElement.width = x;
        currentElement.height = y;
    } else if (currentTool === 'pencil' || currentTool === 'eraser') {
        currentElement.path.push([x, y]);
    } else if (currentTool === 'circle') {
        const radius = Math.sqrt(
            Math.pow(x - currentElement.offsetX, 2) + Math.pow(y - currentElement.offsetY, 2)
        );
        currentElement.width = 2 * radius;
        currentElement.height = 2 * radius;
    }
    
    updateCanvas();
}

function handleMouseUp() {
    if (isDrawing && currentElement) {
        history = [];
    }
    isDrawing = false;
    currentElement = null;
    if (isLive && socket) {
        socket.emit('updateCanvas', {
            roomId: roomId,
            userName: userName,
            updatedElements: elements,
            canvasColor: canvasColor
        });
    }
    
    // Save to Firestore
    if (window.saveCanvasToFirestore && roomId && roomId.trim() !== '') {
        window.saveCanvasToFirestore(roomId, elements, canvasColor);
    }
}

function handleTouchStart(e) {
    e.preventDefault();
    handleMouseDown(e);
}

function handleTouchMove(e) {
    e.preventDefault();
    handleMouseMove(e);
}

function updateCanvas() {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const roughCanvas = rough.canvas(canvas);
    
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    elements.forEach((ele) => {
        if (ele.element === 'rect') {
            roughCanvas.draw(generator.rectangle(
                ele.offsetX, ele.offsetY, ele.width, ele.height, {
                    stroke: ele.stroke,
                    roughness: 0,
                    strokeWidth: ele.strokeWidth
                }
            ));
        } else if (ele.element === 'line') {
            roughCanvas.draw(generator.line(
                ele.offsetX, ele.offsetY, ele.width, ele.height, {
                    stroke: ele.stroke,
                    roughness: 0,
                    strokeWidth: ele.strokeWidth
                }
            ));
        } else if (ele.element === 'pencil') {
            roughCanvas.linearPath(ele.path, {
                stroke: ele.stroke,
                roughness: 0,
                strokeWidth: ele.strokeWidth
            });
        } else if (ele.element === 'circle') {
            roughCanvas.draw(generator.ellipse(
                ele.offsetX, ele.offsetY, ele.width, ele.height, {
                    stroke: ele.stroke,
                    roughness: 0,
                    strokeWidth: ele.strokeWidth
                }
            ));
        } else if (ele.element === 'eraser') {
            roughCanvas.linearPath(ele.path, {
                stroke: ele.stroke,
                roughness: 0,
                strokeWidth: ele.strokeWidth
            });
        }
    });
}

function redrawCanvas() {
    updateCanvas();
}

function initTools() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.dataset.tool;
            
            const eraserCursor = document.getElementById('eraser-cursor');
            if (currentTool === 'eraser') {
                eraserCursor.classList.remove('hidden');
            } else {
                eraserCursor.classList.add('hidden');
            }
        });
    });
    
    document.getElementById('current-color').style.backgroundColor = currentColor;
}

function initColorPicker() {
    const colorPreview = document.getElementById('current-color');
    const colorDropdown = document.getElementById('color-picker-dropdown');
    const colorInput = document.getElementById('color-input');
    
    colorPreview.addEventListener('click', () => {
        colorDropdown.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.color-picker-wrapper')) {
            colorDropdown.classList.add('hidden');
        }
    });
    
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.style.backgroundColor = btn.dataset.color;
        btn.addEventListener('click', () => {
            currentColor = btn.dataset.color;
            colorPreview.style.backgroundColor = currentColor;
            colorInput.value = currentColor;
            colorDropdown.classList.add('hidden');
        });
    });
    
    colorInput.addEventListener('input', (e) => {
        currentColor = e.target.value;
        colorPreview.style.backgroundColor = currentColor;
    });
}

function initUndoRedo() {
    document.getElementById('undo-btn').addEventListener('click', () => {
        if (elements.length < 1) return;
        history.push(elements[elements.length - 1]);
        elements = elements.slice(0, -1);
        updateCanvas();
        if (isLive && socket) {
            socket.emit('updateCanvas', {
                roomId: roomId,
                userName: userName,
                updatedElements: elements,
                canvasColor: canvasColor
            });
        }
        if (window.saveCanvasToFirestore && roomId && roomId.trim() !== '') {
            window.saveCanvasToFirestore(roomId, elements, canvasColor);
        }
    });
    
    document.getElementById('redo-btn').addEventListener('click', () => {
        if (history.length < 1) return;
        elements.push(history[history.length - 1]);
        history = history.slice(0, -1);
        updateCanvas();
        if (isLive && socket) {
            socket.emit('updateCanvas', {
                roomId: roomId,
                userName: userName,
                updatedElements: elements,
                canvasColor: canvasColor
            });
        }
        if (window.saveCanvasToFirestore && roomId && roomId.trim() !== '') {
            window.saveCanvasToFirestore(roomId, elements, canvasColor);
        }
    });
}

function initMenu() {
    const menuBtn = document.getElementById('menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');
    
    menuBtn.addEventListener('click', () => {
        menuDropdown.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#menu-btn') && !e.target.closest('#menu-dropdown')) {
            menuDropdown.classList.add('hidden');
        }
    });
    
    document.getElementById('clear-canvas-btn').addEventListener('click', () => {
        elements = [];
        history = [];
        updateCanvas();
        menuDropdown.classList.add('hidden');
        if (isLive && socket) {
            socket.emit('updateCanvas', {
                roomId: roomId,
                userName: userName,
                updatedElements: elements,
                canvasColor: canvasColor
            });
        }
        if (window.saveCanvasToFirestore && roomId && roomId.trim() !== '') {
            window.saveCanvasToFirestore(roomId, elements, canvasColor);
        }
    });
    
    document.getElementById('save-file-btn').addEventListener('click', () => {
        const data = JSON.stringify(elements);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'drawing.rtb';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        menuDropdown.classList.add('hidden');
        showToast('File Saved Successfully');
    });
    
    document.getElementById('load-file-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && (file.name.endsWith('.rtb') || file.name.endsWith('.json'))) {
            const reader = new FileReader();
            reader.onload = (event) => {
                elements = JSON.parse(event.target.result);
                updateCanvas();
                showToast('File Loaded Successfully');
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid .rtb file');
        }
        menuDropdown.classList.add('hidden');
    });
    
    document.getElementById('stroke-width-slider').addEventListener('input', (e) => {
        strokeWidth = parseInt(e.target.value);
        document.getElementById('stroke-value').textContent = strokeWidth;
    });
    
    document.querySelectorAll('.canvas-color-btn').forEach(btn => {
        btn.style.backgroundColor = btn.dataset.canvasColor;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.canvas-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            canvasColor = btn.dataset.canvasColor;
            updateCanvas();
            if (isLive && socket) {
                socket.emit('updateCanvas', {
                    roomId: roomId,
                    userName: userName,
                    updatedElements: elements,
                    canvasColor: canvasColor
                });
            }
        });
    });
}

function initSessionModal() {
    const modal = document.getElementById('session-modal');
    const liveSessionBtn = document.getElementById('live-session-btn');
    const closeBtn = document.getElementById('close-session-modal');
    const startBtn = document.getElementById('start-session-modal');
    const usernameInput = document.getElementById('username-input');
    const shareLinkContainer = document.getElementById('share-link-container');
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    
    liveSessionBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    usernameInput.addEventListener('change', (e) => {
        userName = e.target.value;
        localStorage.setItem('userName', userName);
    });
    
    startBtn.addEventListener('click', () => {
        if (!isLive) {
            isLive = true;
            connectSocket();
        }
        shareLinkContainer.classList.remove('hidden');
        shareLinkInput.value = `${window.location.origin}/room/${roomId}?live=true`;
        startBtn.textContent = 'Stop';
        startBtn.classList.add('btn-danger');
        startBtn.onclick = () => {
            isLive = false;
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            window.location.href = `/room/${roomId}`;
        };
    });
    
    copyLinkBtn.addEventListener('click', () => {
        shareLinkInput.select();
        navigator.clipboard.writeText(shareLinkInput.value);
        showToast('Copied to Clipboard');
    });
}

function initChat() {
    const chatBtn = document.getElementById('chat-btn');
    const chatModal = document.getElementById('chat-modal');
    const closeChatBtn = document.getElementById('close-chat-modal');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    
    chatBtn.addEventListener('click', () => {
        chatModal.classList.remove('hidden');
        document.getElementById('chat-badge').classList.add('hidden');
    });
    
    closeChatBtn.addEventListener('click', () => {
        chatModal.classList.add('hidden');
    });
    
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (chatInput.value.trim() === '') return;
        sendMessage(chatInput.value);
        chatInput.value = '';
    });
}

function connectSocket() {
    socket = io(SERVER_URL, {
        forceNew: true,
        reconnectionAttempts: 'Infinity',
        timeout: 10000,
        transports: ['websocket']
    });
    
    socket.on('connect', () => {
        socket.emit('joinRoom', {
            roomId: roomId,
            userName: userName
        });
        
        document.getElementById('chat-btn').classList.remove('hidden');
    });
    
    socket.on('updateCanvas', (data) => {
        elements = data.updatedElements;
        canvasColor = data.canvasColor;
        updateCanvas();
    });
    
    socket.on('getMessage', (message) => {
        messages.push(message);
        renderMessage(message);
        
        const chatModal = document.getElementById('chat-modal');
        if (chatModal.classList.contains('hidden')) {
            const badge = document.getElementById('chat-badge');
            badge.textContent = parseInt(badge.textContent) + 1;
            badge.classList.remove('hidden');
        }
    });
}

function sendMessage(message) {
    if (!socket) return;
    
    const data = {
        message: message,
        userName: userName,
        roomId: roomId,
        socketId: socket.id
    };
    
    socket.emit('sendMessage', data);
}

function renderMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const isOwn = message.socketId === socket?.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = isOwn ? 'message own' : 'message other';
    
    if (!isOwn) {
        const userNameDiv = document.createElement('p');
        userNameDiv.className = 'message-username';
        userNameDiv.textContent = message.userName;
        messageDiv.appendChild(userNameDiv);
    }
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = message.message;
    messageDiv.appendChild(textDiv);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const newBtn = document.getElementById('new-drawing-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                sidebar.classList.remove('collapsed');
            } else {
                sidebar.classList.add('open');
                const overlay = document.getElementById('sidebar-overlay') || createSidebarOverlay();
                overlay.classList.add('visible');
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                sidebar.classList.add('collapsed');
            } else {
                sidebar.classList.remove('open');
                const overlay = document.getElementById('sidebar-overlay');
                if (overlay) overlay.classList.remove('visible');
            }
        });
    }
    
    if (newBtn) {
        newBtn.addEventListener('click', startNewSession);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.handleSignOut) window.handleSignOut();
        });
    }

    // Initial load
    loadUserHistory();
}

function createSidebarOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        overlay.classList.remove('visible');
    });
    return overlay;
}

async function loadUserHistory() {
    if (!window.getUserRoomsFromFirestore) return;
    
    const historyList = document.getElementById('history-list');
    try {
        const rooms = await window.getUserRoomsFromFirestore();
        renderHistory(rooms);
    } catch (e) {
        console.error("Error loading history:", e);
        historyList.innerHTML = `
            <div class="px-2 py-4 text-center">
                <div class="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-2">Sync Error</div>
                <div class="text-[10px] text-on-surface/50 leading-relaxed">Ensure composite index exists or wait a few minutes.</div>
                <button onclick="loadUserHistory()" class="mt-4 text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded flex items-center justify-center gap-2 mx-auto hover:bg-red-500/20 transition-all font-headline font-bold uppercase tracking-widest">
                    <span class="material-symbols-outlined text-[12px]">refresh</span> Retry
                </button>
            </div>
        `;
    }
}

function renderHistory(rooms) {
    const historyList = document.getElementById('history-list');
    if (!rooms || rooms.length === 0) {
        historyList.innerHTML = '<div class="text-[10px] text-on-surface/30 px-2 py-4 italic uppercase tracking-widest text-center">No history yet</div>';
        return;
    }

    let untitledCount = 0;
    const reversedRooms = [...rooms].reverse();
    reversedRooms.forEach(room => {
        if (!room.title) {
            untitledCount++;
            room.displayTitle = `Untitled Drawing ${untitledCount}`;
        } else {
            room.displayTitle = room.title;
        }
    });

    historyList.innerHTML = '';
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = `history-item ${room.id === roomId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="material-symbols-outlined history-icon">${room.id === roomId ? 'edit_square' : 'draw'}</span>
            <span class="history-title">${room.displayTitle}</span>
            <div class="history-actions">
                <button class="history-action-btn rename" title="Rename"><span class="material-symbols-outlined text-[14px]">edit</span></button>
                <button class="history-action-btn delete" title="Delete"><span class="material-symbols-outlined text-[14px]">delete</span></button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.history-action-btn')) return;
            if (room.id !== roomId) {
                window.location.href = `/room/${room.id}`;
            }
        });

        const renameBtn = item.querySelector('.rename');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newTitle = prompt('Enter new title:', room.displayTitle);
            if (newTitle && newTitle.trim()) {
                renameDrawing(room.id, newTitle.trim());
            }
        });        
        const deleteBtn = item.querySelector('.delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this drawing?')) {
                deleteDrawing(room.id);
            }
        });
        
        historyList.appendChild(item);
    });
}

async function renameDrawing(id, title) {
    if (window.updateRoomTitleInFirestore) {
        await window.updateRoomTitleInFirestore(id, title);
        loadUserHistory();
        showToast('Drawing renamed');
    }
}

async function deleteDrawing(id) {
    if (window.deleteRoomFromFirestore) {
        await window.deleteRoomFromFirestore(id);
        if (id === roomId) {
            window.location.href = '/';
        } else {
            loadUserHistory();
            showToast('Drawing deleted');
        }
    }
}

window.showToast = showToast;
window.setAppUserName = function(name) {
    userName = name;
    localStorage.setItem('userName', name);
    const input = document.getElementById('username-input');
    if (input) input.value = name;
};

document.addEventListener('DOMContentLoaded', init);