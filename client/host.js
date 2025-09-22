const socket = new WebSocket(`ws://${location.host}`);
const video = document.getElementById('video');
const startShareBtn = document.getElementById('startShare');
const peers = {};
let currentStream = null;
let isSharing = false;

// Improved screen sharing
async function startScreenShare() {
  try {
    // Stop existing stream if any
    if (currentStream) {
      stopScreenShare();
    }

    console.log('Requesting screen share...');
    currentStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: true
    });

    console.log('Screen share started with', currentStream.getTracks().length, 'tracks');

    // Handle when user stops sharing via browser UI
    currentStream.getTracks().forEach(track => {
      track.onended = () => {
        console.log('Track ended:', track.kind);
        stopScreenShare();
      };
    });

    isSharing = true;
    video.srcObject = currentStream;
    startShareBtn.textContent = 'Stop Sharing';
    
    // Send to all existing peers
    Object.keys(peers).forEach(sendStreamToPeer);
  } catch (error) {
    console.error('Screen share error:', error);
    alert(error.message || 'Screen sharing failed');
    stopScreenShare();
  }
}

function stopScreenShare() {
  console.log('Stopping screen share');
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  isSharing = false;
  video.srcObject = null;
  startShareBtn.textContent = 'Start Screen Share';
}

async function sendStreamToPeer(peerId) {
  const pc = peers[peerId];
  if (!pc) return;

  console.log('Sending stream to peer', peerId);

  // Clear existing tracks
  pc.getSenders().forEach(sender => {
    if (sender.track) {
      console.log('Removing track:', sender.track.kind);
      pc.removeTrack(sender);
    }
  });

  // Add new tracks if available
  if (isSharing && currentStream) {
    currentStream.getTracks().forEach(track => {
      console.log('Adding track:', track.kind);
      pc.addTrack(track, currentStream);
    });

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);
      
      socket.send(JSON.stringify({
        type: 'offer',
        offer: pc.localDescription,
        id: peerId
      }));
    } catch (error) {
      console.error('Offer creation error:', error);
    }
  }
}

function createPeerConnection(peerId) {
  console.log('Creating peer connection for', peerId);
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({
        type: 'candidate',
        candidate: event.candidate,
        id: peerId
      }));
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Peer ${peerId} state:`, pc.connectionState);
    if (pc.connectionState === 'disconnected' || 
        pc.connectionState === 'failed') {
      delete peers[peerId];
    }
  };

  return pc;
}

// Event listeners
startShareBtn.onclick = async () => {
  if (isSharing) {
    stopScreenShare();
    return;
  }

  const password = prompt('Enter host password:');
  if (password !== '1080148') {
    alert('Incorrect password');
    return;
  }

  socket.send(JSON.stringify({ type: 'host', password }));
};

socket.onmessage = async (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('Host received:', data.type);

    switch (data.type) {
      case 'join':
        if (!peers[data.id]) {
          peers[data.id] = createPeerConnection(data.id);
          if (isSharing) {
            await sendStreamToPeer(data.id);
          }
        }
        break;

      case 'answer':
        if (peers[data.id]) {
          await peers[data.id].setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
        }
        break;

      case 'candidate':
        if (peers[data.id] && data.candidate) {
          await peers[data.id].addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
        break;

      case 'host-ack':
        console.log('Host authenticated, starting share');
        await startScreenShare();
        break;
    }
  } catch (error) {
    console.error('Host message error:', error);
  }
};

socket.onclose = () => {
  console.log('WebSocket closed');
  stopScreenShare();
};

socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};