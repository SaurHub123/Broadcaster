const socket = new WebSocket(`ws://${location.host}`);
console.log(location.host);
const video = document.getElementById('video');
const statusEl = document.getElementById('status-message');
const connectionStatusEl = document.getElementById('connection-status');
const adImage = document.getElementById('ad-image');
const adText = document.getElementById('ad-text');

// Generate unique ID for this receiver
const id = 'viewer-' + Math.random().toString(36).substring(2);
let pc = null;
let reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

// Advertisement data
const ads = [
  {
    image: '/static/ads/Asian.jpg',
    text: 'Sponsored by: Asian Paints'
  },
  {
    image: '/static/ads/cars24.png',
    text: 'Brought to you by: Cars24'
  },
  {
    image: '/static/ads/dermaco.jpg',
    text: 'Powered by: The Derma Co.'
  },
  {
    image: '/static/ads/listerine.jpg',
    text: 'Presented by: LISTERINE'
  },
  {
    image: '/static/ads/sarat-nair.jpg',
    text: 'In collaboration with: Blinkit'
  },
  {
    image: '/static/ads/CU.jpg',
    text: 'Official Partner: Chandigarh University Mohali Campus'
  },
  {
    image: '/static/ads/Zepto.jpg',
    text: 'Proudly associated with: Zepto'
  }
];


// Initialize
rotateAd();
setInterval(rotateAd, 30000); // Rotate every 30 seconds
updateConnectionStatus(false);
showStatusMessage('Connecting to broadcast server...');

// WebSocket handlers
socket.onopen = () => {
  console.log('WebSocket connected');
  socket.send(JSON.stringify({ type: 'join', id }));
};

socket.onmessage = async (event) => {
  console.log('Received:', event.data);
  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'offer':
        await handleOffer(data);
        break;

      case 'candidate':
        await handleCandidate(data);
        break;

      case 'host-connected':
        handleHostConnected();
        break;

      case 'host-disconnected':
        handleHostDisconnected();
        break;
    }
  } catch (error) {
    console.error('Message handling error:', error);
  }
};

socket.onclose = () => {
  console.log('WebSocket closed');
  handleHostDisconnected();
  attemptReconnect();
};

socket.onerror = (error) => {
  console.error('WebSocket error:', error);
  showStatusMessage('Connection error');
};

// Peer Connection management
async function handleOffer(data) {
  if (!pc) {
    pc = createPeerConnection();
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.send(JSON.stringify({
      type: 'answer',
      answer: pc.localDescription,
      id
    }));
  } catch (error) {
    console.error('Offer handling error:', error);
  }
}

async function handleCandidate(data) {
  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('Candidate error:', error);
    }
  }
}

function createPeerConnection() {
  console.log('Creating new PeerConnection');
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      console.log('Received stream with', event.streams[0].getTracks().length, 'tracks');
      video.srcObject = event.streams[0];
      showStatusMessage('Stream started');
      updateConnectionStatus(true);
      reconnectAttempts = 0;
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({
        type: 'candidate',
        candidate: event.candidate,
        id
      }));
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'disconnected' || 
        pc.connectionState === 'failed') {
      handleHostDisconnected();
    }
  };

  return pc;
}

// Status management
function handleHostConnected() {
  showStatusMessage('Host connected. Starting stream...');
  updateConnectionStatus(true);
  reconnectAttempts = 0;
  clearTimeout(reconnectTimer);
}

function handleHostDisconnected() {
  showStatusMessage('Host disconnected');
  updateConnectionStatus(false);
  cleanupPeerConnection();
}

function cleanupPeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (video.srcObject) {
    video.srcObject = null;
  }
}

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showStatusMessage('Failed to reconnect. Please refresh the page.');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(30000, 2000 * reconnectAttempts);
  
  showStatusMessage(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  reconnectTimer = setTimeout(() => {
    socket.send(JSON.stringify({ type: 'reconnect', id }));
  }, delay);
}

// UI functions
function rotateAd() {
  const ad = ads[Math.floor(Math.random() * ads.length)];
  adImage.src = ad.image;
  adText.textContent = ad.text;
}

function showStatusMessage(message) {
  statusEl.textContent = message;
  statusEl.style.display = 'block';
  
  if (!message.includes('Attempting') && !message.includes('Failed')) {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

function updateConnectionStatus(connected) {
  connectionStatusEl.textContent = connected ? 'Live' : 'Offline';
  connectionStatusEl.className = connected 
    ? 'connection-status status-connected' 
    : 'connection-status status-disconnected';
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !pc) {
    socket.send(JSON.stringify({ type: 'reconnect', id }));
  }
});