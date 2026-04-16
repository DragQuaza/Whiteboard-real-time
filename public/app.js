const SERVER_URL = window.BACKEND_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5001' 
    : 'https://whiteboard-real-time-one.onrender.com'); // Default Render URL

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
let pendingLiveAction = null;
let participants = [];
let landingInitialized = false;
let roomInitialized = false;
let activeRoomLoadRequest = 0;
let cleanupCanvasTransientUI = () => {};

const DEFAULT_CANVAS_COLOR = '#131313';

const generator = rough.generator();

function getAuthenticatedUserName() {
    if (window.getAuthenticatedUserName) {
        return window.getAuthenticatedUserName();
    }
    return null;
}

function isAuthenticatedForLiveSession() {
    return Boolean(window.isAuthenticatedUser && window.isAuthenticatedUser());
}

function syncLiveSessionIdentity() {
    const usernameInput = document.getElementById('username-input');
    const authenticatedName = getAuthenticatedUserName();
    
    if (authenticatedName) {
        userName = authenticatedName;
        localStorage.setItem('userName', authenticatedName);
    }
    
    if (!usernameInput) return;
    
    usernameInput.readOnly = !authenticatedName;
    usernameInput.value = authenticatedName || 'Sign in with Google to use live sessions';
}

function openLiveAuthModal(message, action = 'join') {
    const modal = document.getElementById('live-auth-modal');
    const messageNode = document.getElementById('live-auth-message');
    if (!modal || !messageNode) return;
    
    pendingLiveAction = action;
    messageNode.textContent = message;
    modal.classList.remove('hidden');
}

function closeLiveAuthModal() {
    const modal = document.getElementById('live-auth-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function getParticipantInitials(name) {
    return (name || 'User')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
}

function updatePresenceUI() {
    const participantsBtn = document.getElementById('participants-btn');
    const presencePill = document.getElementById('presence-pill');
    const countNode = document.getElementById('presence-count');
    const pillCountNode = document.getElementById('participants-count-pill');
    const summaryCountNode = document.getElementById('participants-summary-count');
    const participantsList = document.getElementById('participants-list');
    const total = participants.length;

    if (countNode) countNode.textContent = total;
    if (pillCountNode) pillCountNode.textContent = total;
    if (summaryCountNode) {
        summaryCountNode.textContent = `${total} ${total === 1 ? 'person' : 'people'} connected`;
    }

    const isVisible = isLive && total > 0;
    if (participantsBtn) participantsBtn.classList.toggle('hidden', !isVisible);
    if (presencePill) presencePill.classList.toggle('hidden', !isVisible);

    if (!participantsList) return;

    if (!total) {
        participantsList.innerHTML = '<div class="participants-empty">No one is in the room yet</div>';
        return;
    }

    participantsList.innerHTML = participants.map((participant) => {
        const isOwn = participant.socketId === socket?.id;
        const roleLabel = isOwn ? 'You' : 'Participant';
        return `
            <div class="participant-row">
                <div class="participant-avatar">${getParticipantInitials(participant.userName)}</div>
                <div class="participant-meta">
                    <div class="participant-name">${participant.userName}</div>
                    <div class="participant-role">${roleLabel}</div>
                </div>
                <div class="participant-status">Connected</div>
            </div>
        `;
    }).join('');
}

function requireGoogleSignInForLiveSession(action) {
    syncLiveSessionIdentity();
    if (isAuthenticatedForLiveSession()) {
        return true;
    }
    
    const message = action === 'host'
        ? 'Sign in with Google to start a live session. Everyone in chat will appear by their Google identity.'
        : 'Sign in with Google to join this live session. Chat and collaboration use Google identities so everyone knows who is here.';
    
    openLiveAuthModal(message, action);
    return false;
}

function isRoomRoute(path = window.location.pathname) {
    return path.startsWith('/room/');
}

function getRoomIdFromPath(path = window.location.pathname) {
    if (!isRoomRoute(path)) return null;
    const [, routeRoomId] = path.split('/room/');
    return routeRoomId ? decodeURIComponent(routeRoomId.split('?')[0]) : null;
}

function setRouteMode() {
    document.documentElement.dataset.appRoute = isRoomRoute() ? 'room' : 'landing';
}

function updateHistorySelection() {
    document.querySelectorAll('.history-item').forEach((item) => {
        const isActive = item.dataset.roomId === roomId;
        item.classList.toggle('active', isActive);

        const icon = item.querySelector('.history-icon');
        if (icon) {
            icon.textContent = isActive ? 'edit_square' : 'draw';
        }
    });
}

function resetChatUI() {
    messages = [];

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }

    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) {
        chatBadge.textContent = '0';
        chatBadge.classList.add('hidden');
    }

    const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
        chatBtn.classList.add('hidden');
    }
}

function disconnectLiveSession() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    participants = [];
    updatePresenceUI();
    resetChatUI();
}

function resetSessionModalState() {
    const sessionModal = document.getElementById('session-modal');
    const authModal = document.getElementById('live-auth-modal');
    const participantsModal = document.getElementById('participants-modal');
    const chatModal = document.getElementById('chat-modal');
    const exportModal = document.getElementById('export-modal');
    const menuDropdown = document.getElementById('menu-dropdown');
    const shareLinkContainer = document.getElementById('share-link-container');
    const shareLinkInput = document.getElementById('share-link-input');
    const startBtn = document.getElementById('start-session-modal');

    [sessionModal, authModal, participantsModal, chatModal, exportModal, menuDropdown].forEach((node) => {
        if (node) node.classList.add('hidden');
    });

    if (shareLinkContainer) shareLinkContainer.classList.add('hidden');
    if (shareLinkInput) shareLinkInput.value = '';
    if (startBtn) {
        startBtn.textContent = 'Start';
        startBtn.classList.remove('btn-danger');
        startBtn.onclick = null;
    }

    pendingLiveAction = null;
}

function setRoomTransitionState(isLoading, message = 'Loading drawing...') {
    const transition = document.getElementById('room-transition');
    const messageNode = document.getElementById('room-transition-message');
    if (!transition) return;

    if (messageNode) {
        messageNode.textContent = message;
    }

    transition.classList.toggle('hidden', !isLoading);
}

function clearRoomState() {
    cleanupCanvasTransientUI();
    elements = [];
    history = [];
    currentElement = null;
    isDrawing = false;
    canvasColor = DEFAULT_CANVAS_COLOR;
}

function navigateTo(path, { replace = false, skipTransition = false } = {}) {
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === path) return;

    const updateHistory = replace ? window.history.replaceState : window.history.pushState;
    updateHistory.call(window.history, {}, '', path);
    handleRouteChange({ skipTransition });
}

function navigateToRoom(nextRoomId, options = {}) {
    const search = options.live ? '?live=true' : '';
    navigateTo(`/room/${nextRoomId}${search}`, options);
}

function handleRouteChange({ skipTransition = false } = {}) {
    setRouteMode();

    if (isRoomRoute()) {
        roomId = getRoomIdFromPath();
        initRoom({ skipTransition });
        return;
    }

    initLanding();
}

function init() {
    window.addEventListener('popstate', () => {
        handleRouteChange();
    });

    handleRouteChange({ skipTransition: true });
}

function initLanding() {
    if (!landingInitialized) {
        document.getElementById('start-session-btn').addEventListener('click', startNewSession);
        
        const createBtn = document.getElementById('create-session-btn');
        if (createBtn) {
            createBtn.addEventListener('click', startNewSession);
        }

        landingInitialized = true;
    }

    document.getElementById('landing-page').classList.remove('hidden');
    document.getElementById('room-page').classList.add('hidden');

    activeRoomLoadRequest++;
    cleanupCanvasTransientUI();
    roomId = null;
    isLive = false;
    setRoomTransitionState(false);
    disconnectLiveSession();
    resetSessionModalState();
}

function startNewSession() {
    navigateToRoom(generateRoomId());
}

window.startNewSession = startNewSession;

async function loadRoom() {
    const requestId = ++activeRoomLoadRequest;
    const nextIsLive = new URLSearchParams(window.location.search).get('live') === 'true';

    cleanupCanvasTransientUI();
    disconnectLiveSession();
    resetSessionModalState();
    isLive = nextIsLive;
    updatePresenceUI();
    updateHistorySelection();

    let nextElements = [];
    let nextCanvasColor = DEFAULT_CANVAS_COLOR;

    if (window.getCanvasFromFirestore && roomId) {
        const data = await window.getCanvasFromFirestore(roomId);
        if (requestId !== activeRoomLoadRequest) return;

        if (data) {
            nextElements = data.elements || [];
            nextCanvasColor = data.canvasColor || DEFAULT_CANVAS_COLOR;
        }
    }

    if (requestId !== activeRoomLoadRequest) return;

    elements = nextElements;
    history = [];
    currentElement = null;
    isDrawing = false;
    canvasColor = nextCanvasColor;
    updateCanvas();

    if (isLive && requireGoogleSignInForLiveSession('join')) {
        connectSocket();
    }

    setRoomTransitionState(false);
}

function initRoom({ skipTransition = false } = {}) {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('room-page').classList.remove('hidden');
    const wasRoomInitialized = roomInitialized;
    
    if (!roomInitialized) {
        initCanvas();
        initTools();
        initColorPicker();
        initUndoRedo();
        initMenu();
        initSessionModal();
        initChat();
        initSidebar();
        roomInitialized = true;
    }
    
    userName = localStorage.getItem('userName') || 'Anonymous';
    syncLiveSessionIdentity();

    if (!skipTransition && wasRoomInitialized) {
        setRoomTransitionState(true);
    }

    loadRoom();
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
        // --- Text selection and movement state ---
        let selectedTextIndex = null;
        let isDraggingText = false;
        let dragOffset = { x: 0, y: 0 };
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
    
    let textBoxStart = null;
    let textBoxDiv = null;
    let textBoxActive = false;
    let textBoxPreview = null;

    cleanupCanvasTransientUI = () => {
        if (textBoxDiv?.parentNode) {
            textBoxDiv.parentNode.removeChild(textBoxDiv);
        }
        if (textBoxPreview?.parentNode) {
            textBoxPreview.parentNode.removeChild(textBoxPreview);
        }

        textBoxDiv = null;
        textBoxPreview = null;
        textBoxStart = null;
        textBoxActive = false;
        selectedTextIndex = null;
        isDraggingText = false;
    };

    canvas.addEventListener('mousedown', function(e) {
        const mouse = getOffset(e, e.target);
        // Check if clicking on a text element
        let found = false;
        for (let i = elements.length - 1; i >= 0; i--) {
            const ele = elements[i];
            if (ele.element === 'text') {
                if (
                    mouse.x >= ele.offsetX && mouse.x <= ele.offsetX + ele.width &&
                    mouse.y >= ele.offsetY && mouse.y <= ele.offsetY + ele.height
                ) {
                    selectedTextIndex = i;
                    dragOffset.x = mouse.x - ele.offsetX;
                    dragOffset.y = mouse.y - ele.offsetY;
                    isDraggingText = true;
                    found = true;
                    break;
                }
            }
        }
        if (found) {
            // Do not start new text box, start drag
            return;
        }
        if (currentTool === 'text') {
            textBoxStart = mouse;
            textBoxActive = true;
            // Create preview div
            if (!textBoxPreview) {
                textBoxPreview = document.createElement('div');
                textBoxPreview.style.position = 'absolute';
                textBoxPreview.style.border = '2px dashed #CCFF00';
                textBoxPreview.style.pointerEvents = 'none';
                textBoxPreview.style.zIndex = 2999;
                document.body.appendChild(textBoxPreview);
            }
        } else {
            handleMouseDown(e);
        }
    });
    // Double click to edit text
    canvas.addEventListener('dblclick', function(e) {
        const mouse = getOffset(e, e.target);
        for (let i = elements.length - 1; i >= 0; i--) {
            const ele = elements[i];
            if (ele.element === 'text') {
                if (
                    mouse.x >= ele.offsetX && mouse.x <= ele.offsetX + ele.width &&
                    mouse.y >= ele.offsetY && mouse.y <= ele.offsetY + ele.height
                ) {
                    // Show textarea overlay for editing
                    showTextEditOverlay(ele, i);
                    break;
                }
            }
        }
    });

    function showTextEditOverlay(ele, idx) {
        // Remove any existing overlay
        if (textBoxDiv) document.body.removeChild(textBoxDiv);
        textBoxDiv = document.createElement('textarea');
        textBoxDiv.style.position = 'absolute';
        const rect = canvas.getBoundingClientRect();
        textBoxDiv.style.left = (rect.left + ele.offsetX) + 'px';
        textBoxDiv.style.top = (rect.top + ele.offsetY) + 'px';
        textBoxDiv.style.width = ele.width + 'px';
        textBoxDiv.style.height = ele.height + 'px';
        textBoxDiv.style.font = ele.font || '20px cursive, Comic Sans MS, Manrope, sans-serif';
        textBoxDiv.style.color = ele.color || currentColor;
        textBoxDiv.style.background = canvasColor;
        textBoxDiv.style.border = '1.5px solid #CCFF00';
        textBoxDiv.style.zIndex = 3000;
        textBoxDiv.style.resize = 'none';
        textBoxDiv.style.padding = '4px';
        textBoxDiv.style.overflow = 'auto';
        textBoxDiv.value = ele.text;
        document.body.appendChild(textBoxDiv);
        textBoxDiv.focus();

        function saveEdit() {
            const value = textBoxDiv.value;
            if (value && value.trim()) {
                elements[idx].text = value;
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
            }
            document.body.removeChild(textBoxDiv);
            textBoxDiv = null;
        }
        textBoxDiv.addEventListener('blur', saveEdit);
        textBoxDiv.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                saveEdit();
            }
        });
    }

    canvas.addEventListener('mousemove', function(e) {
        const mouse = getOffset(e, e.target);
        // Drag text
        if (isDraggingText && selectedTextIndex !== null) {
            const ele = elements[selectedTextIndex];
            ele.offsetX = mouse.x - dragOffset.x;
            ele.offsetY = mouse.y - dragOffset.y;
            updateCanvas();
            return;
        }
        if (currentTool === 'text' && textBoxActive && textBoxStart && textBoxPreview) {
            const curr = mouse;
            const x = Math.min(textBoxStart.x, curr.x);
            const y = Math.min(textBoxStart.y, curr.y);
            const width = Math.abs(curr.x - textBoxStart.x) || 1;
            const height = Math.abs(curr.y - textBoxStart.y) || 1;
            const rect = canvas.getBoundingClientRect();
            textBoxPreview.style.left = (rect.left + x) + 'px';
            textBoxPreview.style.top = (rect.top + y) + 'px';
            textBoxPreview.style.width = width + 'px';
            textBoxPreview.style.height = height + 'px';
            textBoxPreview.style.background = canvasColor;
        }
    });

    canvas.addEventListener('mouseup', function(e) {
        if (isDraggingText && selectedTextIndex !== null) {
            // Save new position
            isDraggingText = false;
            selectedTextIndex = null;
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
            return;
        }
        if (currentTool === 'text' && textBoxActive && textBoxStart) {
            const end = getOffset(e, e.target);
            const x = Math.min(textBoxStart.x, end.x);
            const y = Math.min(textBoxStart.y, end.y);
            const width = Math.abs(end.x - textBoxStart.x) || 150;
            const height = Math.abs(end.y - textBoxStart.y) || 40;

            // Remove preview
            if (textBoxPreview) {
                document.body.removeChild(textBoxPreview);
                textBoxPreview = null;
            }

            // Create textarea overlay
            if (textBoxDiv) document.body.removeChild(textBoxDiv);
            textBoxDiv = document.createElement('textarea');
            textBoxDiv.style.position = 'absolute';
            const rect = canvas.getBoundingClientRect();
            textBoxDiv.style.left = (rect.left + x) + 'px';
            textBoxDiv.style.top = (rect.top + y) + 'px';
            textBoxDiv.style.width = width + 'px';
            textBoxDiv.style.height = height + 'px';
            textBoxDiv.style.font = '20px cursive, Comic Sans MS, Manrope, sans-serif';
            textBoxDiv.style.color = currentColor;
            textBoxDiv.style.background = canvasColor;
            textBoxDiv.style.border = '1.5px solid #CCFF00';
            textBoxDiv.style.zIndex = 3000;
            textBoxDiv.style.resize = 'none';
            textBoxDiv.style.padding = '4px';
            textBoxDiv.style.overflow = 'auto';
            document.body.appendChild(textBoxDiv);
            textBoxDiv.focus();

            function saveTextBox() {
                const value = textBoxDiv.value;
                if (value && value.trim()) {
                    elements.push({
                        element: 'text',
                        text: value,
                        offsetX: x,
                        offsetY: y,
                        width,
                        height,
                        color: currentColor,
                        font: '20px cursive, Comic Sans MS, Manrope, sans-serif'
                    });
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
                }
                document.body.removeChild(textBoxDiv);
                textBoxDiv = null;
                textBoxActive = false;
                textBoxStart = null;
            }

            textBoxDiv.addEventListener('blur', saveTextBox);
            textBoxDiv.addEventListener('keydown', function(ev) {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    saveTextBox();
                }
            });
        }
    });
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

    // Paste event for images
    canvas.addEventListener('paste', async (e) => {
        if (e.clipboardData) {
            for (const item of e.clipboardData.items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        addImageToCanvas(evt.target.result, canvas.width / 4, canvas.height / 4);
                    };
                    reader.readAsDataURL(file);
                }
            }
        }
    });

    // Drag-and-drop event for images
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    addImageToCanvas(evt.target.result, e.offsetX * 2, e.offsetY * 2);
                };
                reader.readAsDataURL(file);
            }
        }
    });
}

// Helper to add image to canvas and elements
function addImageToCanvas(dataUrl, x, y) {
    const img = new window.Image();
    img.onload = function() {
        const width = img.width;
        const height = img.height;
        elements.push({
            element: 'image',
            src: dataUrl,
            offsetX: x,
            offsetY: y,
            width,
            height
        });
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
    };
    img.src = dataUrl;
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
    } else if (currentTool === 'arrow') {
        currentElement = {
            offsetX: x,
            offsetY: y,
            width: x,
            height: y,
            stroke: currentColor,
            element: currentTool,
            strokeWidth: strokeWidth
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
    } else if (currentTool === 'line' || currentTool === 'arrow') {
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
        } else if (ele.element === 'arrow') {
            // Draw main line
            roughCanvas.draw(generator.line(
                ele.offsetX, ele.offsetY, ele.width, ele.height, {
                    stroke: ele.stroke,
                    roughness: 0,
                    strokeWidth: ele.strokeWidth
                }
            ));
            // Draw arrowhead
            const angle = Math.atan2(ele.height - ele.offsetY, ele.width - ele.offsetX);
            const headlen = 24; // length of head in px
            const tox = ele.width;
            const toy = ele.height;
            const fromx = ele.offsetX;
            const fromy = ele.offsetY;
            const arrowPoints = [
                [tox - headlen * Math.cos(angle - Math.PI / 7), toy - headlen * Math.sin(angle - Math.PI / 7)],
                [tox, toy],
                [tox - headlen * Math.cos(angle + Math.PI / 7), toy - headlen * Math.sin(angle + Math.PI / 7)]
            ];
            roughCanvas.linearPath(arrowPoints, {
                stroke: ele.stroke,
                roughness: 0,
                strokeWidth: ele.strokeWidth
            });
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
        } else if (ele.element === 'image') {
            const img = new window.Image();
            img.onload = function() {
                ctx.drawImage(img, ele.offsetX, ele.offsetY, ele.width, ele.height);
            };
            img.src = ele.src;
            // For immediate draw if cached
            if (img.complete) {
                ctx.drawImage(img, ele.offsetX, ele.offsetY, ele.width, ele.height);
            }
        } else if (ele.element === 'text') {
            ctx.save();
            ctx.font = ele.font || '20px cursive, Comic Sans MS, Manrope, sans-serif';
            ctx.fillStyle = ele.color || '#fff';
            ctx.textBaseline = 'top';
            const lines = (ele.text || '').split('\n');
            let lineHeight = 24;
            let y = ele.offsetY;
            for (let line of lines) {
                ctx.fillText(line, ele.offsetX, y, ele.width || undefined);
                y += lineHeight;
            }
            ctx.restore();
        }
    });
}

function redrawCanvas() {
    updateCanvas();
}

function initTools() {
    const eraserCursor = document.getElementById('eraser-cursor');

    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn[data-tool]').forEach((toolBtn) => {
                toolBtn.classList.remove('active');
            });

            btn.classList.add('active');
            currentTool = btn.dataset.tool;

            if (!eraserCursor) return;
            eraserCursor.classList.toggle('hidden', currentTool !== 'eraser');
        });
    });

    if (eraserCursor) {
        eraserCursor.classList.toggle('hidden', currentTool !== 'eraser');
    }
}

function initColorPicker() {
    const colorPreview = document.getElementById('current-color');
    const colorDropdown = document.getElementById('color-picker-dropdown');
    const colorInput = document.getElementById('color-input');

    if (!colorPreview || !colorDropdown || !colorInput) return;

    colorPreview.style.backgroundColor = currentColor;
    colorInput.value = currentColor;

    colorPreview.addEventListener('click', () => {
        colorDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.color-picker-wrapper')) {
            colorDropdown.classList.add('hidden');
        }
    });

    document.querySelectorAll('.color-btn').forEach((btn) => {
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
    const exportModal = document.getElementById('export-modal');
    const closeExportModalBtn = document.getElementById('close-export-modal');
    
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
    
    document.getElementById('export-board-btn').addEventListener('click', () => {
        menuDropdown.classList.add('hidden');
        if (exportModal) {
            exportModal.classList.remove('hidden');
        }
    });

    if (closeExportModalBtn) {
        closeExportModalBtn.addEventListener('click', () => {
            exportModal.classList.add('hidden');
        });
    }

    document.getElementById('export-image-btn').addEventListener('click', () => {
        const canvas = document.getElementById('board');
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${roomId || 'whiteboard'}.png`;
        link.href = url;
        link.click();
        exportModal.classList.add('hidden');
        showToast('Board exported as image');
    });

    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        const canvas = document.getElementById('board');
        const pdfApi = window.jspdf?.jsPDF;

        if (!pdfApi) {
            showToast('PDF export is unavailable right now');
            return;
        }

        const imageData = canvas.toDataURL('image/png');
        const pdf = new pdfApi({
            orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });
        pdf.addImage(imageData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${roomId || 'whiteboard'}.pdf`);
        exportModal.classList.add('hidden');
        showToast('Board exported as PDF');
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
    const authModal = document.getElementById('live-auth-modal');
    const liveSessionBtn = document.getElementById('live-session-btn');
    const closeBtn = document.getElementById('close-session-modal');
    const closeAuthBtn = document.getElementById('close-live-auth-modal');
    const authSignInBtn = document.getElementById('live-auth-signin-btn');
    const startBtn = document.getElementById('start-session-modal');
    const usernameInput = document.getElementById('username-input');
    const shareLinkContainer = document.getElementById('share-link-container');
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    
    liveSessionBtn.addEventListener('click', () => {
        syncLiveSessionIdentity();
        if (!requireGoogleSignInForLiveSession('host')) return;
        modal.classList.remove('hidden');
    });
    
    // Make username editable after Google auth
    usernameInput.addEventListener('input', (e) => {
        userName = e.target.value.trim() || getAuthenticatedUserName() || 'Anonymous';
        localStorage.setItem('userName', userName);
        const sidebarUserName = document.getElementById('sidebar-user-name');
        if (sidebarUserName) sidebarUserName.textContent = userName;
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    if (closeAuthBtn) {
        closeAuthBtn.addEventListener('click', () => {
            closeLiveAuthModal();
            if (pendingLiveAction === 'join') {
                const liveUrl = new URL(window.location.href);
                liveUrl.searchParams.delete('live');
                navigateTo(`${liveUrl.pathname}${liveUrl.search}`, { replace: true, skipTransition: true });
            }
            pendingLiveAction = null;
        });
    }
    
    if (authSignInBtn) {
        authSignInBtn.addEventListener('click', async () => {
            if (window.handleGoogleSignIn) {
                await window.handleGoogleSignIn();
            }
        });
    }
    
    usernameInput.readOnly = true;
    syncLiveSessionIdentity();
    
    startBtn.addEventListener('click', () => {
        if (!requireGoogleSignInForLiveSession('host')) return;
        userName = getAuthenticatedUserName() || userName;
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
            disconnectLiveSession();
            navigateToRoom(roomId, { replace: true, skipTransition: true });
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
    const participantsBtn = document.getElementById('participants-btn');
    const participantsModal = document.getElementById('participants-modal');
    const closeParticipantsBtn = document.getElementById('close-participants-modal');
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

    if (participantsBtn && participantsModal) {
        participantsBtn.addEventListener('click', () => {
            participantsModal.classList.remove('hidden');
        });
    }

    if (closeParticipantsBtn && participantsModal) {
        closeParticipantsBtn.addEventListener('click', () => {
            participantsModal.classList.add('hidden');
        });
    }
    
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (chatInput.value.trim() === '') return;
        sendMessage(chatInput.value);
        chatInput.value = '';
    });
}

function connectSocket() {
    if (!isAuthenticatedForLiveSession()) {
        requireGoogleSignInForLiveSession('join');
        return;
    }
    if (socket) return;
    
    userName = getAuthenticatedUserName() || userName;
    socket = io(SERVER_URL, {
        forceNew: true,
        reconnectionAttempts: Infinity,
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

    socket.on('roomParticipants', (roomParticipants) => {
        participants = roomParticipants || [];
        updatePresenceUI();
    });

    socket.on('disconnect', () => {
        participants = [];
        updatePresenceUI();
    });
}

function sendMessage(message) {
    if (!socket) return;
    userName = getAuthenticatedUserName() || userName;
    
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
    const isSystem = message.type === 'system';
    const isOwn = !isSystem && message.socketId === socket?.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = isSystem ? 'message system' : (isOwn ? 'message own' : 'message other');

    if (!isSystem) {
        const userNameDiv = document.createElement('p');
        userNameDiv.className = 'message-username';
        userNameDiv.textContent = isOwn ? `${message.userName} (You)` : message.userName;
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

window.loadUserHistory = loadUserHistory;
window.renderHistory = renderHistory;

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
        item.dataset.roomId = room.id;
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
                navigateToRoom(room.id);
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
            deleteDrawing(room.id);
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
            clearRoomState();
            if (roomInitialized) {
                updateCanvas();
            }
            navigateTo('/', { replace: true, skipTransition: true });
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

window.handleLiveAuthStateChange = function(authenticatedUser) {
    syncLiveSessionIdentity();
    
    if (authenticatedUser) {
        closeLiveAuthModal();
        
        if (pendingLiveAction === 'host') {
            const modal = document.getElementById('session-modal');
            if (modal) modal.classList.remove('hidden');
        }
        
        if (pendingLiveAction === 'join' && isLive && !socket) {
            connectSocket();
        }
        
        pendingLiveAction = null;
        return;
    }
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    participants = [];
    updatePresenceUI();
    
    const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
        chatBtn.classList.add('hidden');
    }
    
    if (isLive) {
        openLiveAuthModal(
            'Sign in with Google to join this live session. Chat and collaboration use Google identities so everyone knows who is here.',
            'join'
        );
    }
};

document.addEventListener('DOMContentLoaded', init);
