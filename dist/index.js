"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
let host = null;
const viewers = new Map();
// Serve static files
app.use('/static', express_1.default.static(path_1.default.join(__dirname, '../client')));
app.use('/static/ads', express_1.default.static(path_1.default.join(__dirname, '../client/ads')));
wss.on('connection', (ws) => {
    console.log('New connection');
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            console.log('Received:', data.type);
            switch (data.type) {
                case 'host':
                    if (data.password === '1080148') {
                        ws.isHost = true;
                        host = ws;
                        console.log('Host authenticated');
                        // Notify all viewers
                        viewers.forEach(viewer => {
                            viewer.send(JSON.stringify({
                                type: 'host-connected',
                                id: viewer.id
                            }));
                        });
                        ws.send(JSON.stringify({ type: 'host-ack' }));
                    }
                    else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Invalid password'
                        }));
                        ws.close();
                    }
                    break;
                case 'join':
                    ws.id = data.id;
                    viewers.set(data.id, ws);
                    console.log(`Viewer ${data.id} joined (${viewers.size} total)`);
                    if (host) {
                        host.send(JSON.stringify({
                            type: 'join',
                            id: data.id
                        }));
                        ws.send(JSON.stringify({
                            type: 'host-connected'
                        }));
                    }
                    else {
                        ws.send(JSON.stringify({
                            type: 'host-disconnected'
                        }));
                    }
                    break;
                case 'reconnect':
                    if (viewers.has(data.id)) {
                        ws.id = data.id;
                        viewers.set(data.id, ws);
                        console.log(`Viewer ${data.id} reconnected`);
                        if (host) {
                            host.send(JSON.stringify({
                                type: 'join',
                                id: data.id
                            }));
                        }
                    }
                    break;
                default:
                    // Route messages properly
                    if (ws.isHost) {
                        // Host to specific viewer
                        const target = viewers.get(data.id);
                        if (target && target.readyState === ws_1.WebSocket.OPEN) {
                            target.send(JSON.stringify(data));
                        }
                    }
                    else if (host && host.readyState === ws_1.WebSocket.OPEN) {
                        // Viewer to host
                        host.send(JSON.stringify(data));
                    }
            }
        }
        catch (error) {
            console.error('Message handling error:', error);
        }
    });
    ws.on('close', () => {
        console.log('Connection closed');
        if (ws.isHost) {
            console.log('Host disconnected');
            host = null;
            viewers.forEach(viewer => {
                viewer.send(JSON.stringify({
                    type: 'host-disconnected'
                }));
            });
            viewers.clear();
        }
        else if (ws.id) {
            viewers.delete(ws.id);
            console.log(`Viewer ${ws.id} disconnected (${viewers.size} remaining)`);
        }
    });
});
// Routes
app.get('/host', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../client/host.html'));
});
app.get('/receiver', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../client/receiver.html'));
});
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
