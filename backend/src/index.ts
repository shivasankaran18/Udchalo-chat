import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws'; // Removed unnecessary WebSocket import
import { v4 as uuidv4 } from 'uuid';
import { userRouter } from './routes/userRouter';
import { adminRouter } from './routes/adminRouter';
import cors from 'cors';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.json());
app.use(cors());
app.use('/api/user', userRouter);
app.use('/api/admin', adminRouter);

interface Message {
    type: 'message' | 'join' | 'leave' | 'history';
    room: string;
    username?: string;
    content?: string;
    timestamp?: Date;
    messageId?: string;
}

interface ClientInfo {
    username: string;
    room: string;
}

// Store chat history per room
const rooms = new Map<string, Message[]>();

// Store active clients and their room details
const clients = new Map<WebSocket, ClientInfo>();

wss.on('connection', (ws : WebSocket) => {
    console.log('New client connected');

    ws.on('message', (data) => {
        try {
            const message: Message = JSON.parse(data.toString());
            switch (message.type) {
                case 'join':
                    handleJoin(ws, message);
                    break;
                case 'message':
                    handleMessage(ws, message);
                    break;
                case 'leave':
                    handleLeave(ws);
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        handleLeave(ws);
        console.log('Client disconnected');
    });
});

function handleJoin(ws: WebSocket, message: Message) {
    if (!message.room || !message.username) {
        console.error('Invalid join message');
        return;
    }

    // Store client info
    clients.set(ws, { username: message.username, room: message.room });

    // Create room if it doesn't exist
    if (!rooms.has(message.room)) {
        rooms.set(message.room, []);
    }

    // Send chat history to the new user
    const historyMessage: Message = {
        type: 'history',
        room: message.room,
        content: JSON.stringify(rooms.get(message.room))
    };
    ws.send(JSON.stringify(historyMessage));

    // Broadcast join message to the room
    const joinMessage: Message = {
        type: 'join',
        room: message.room,
        username: message.username,
        content: `${message.username} joined the room`,
        timestamp: new Date()
    };
    broadcastMessage(message.room, joinMessage);
}

function handleMessage(ws: WebSocket, message: Message) {
    const clientInfo = clients.get(ws);
    if (!clientInfo || !message.content) return;

    const fullMessage: Message = {
        ...message,
        username: clientInfo.username,
        timestamp: new Date(),
        messageId: uuidv4()
    };

    // Save message to room history
    rooms.get(clientInfo.room)?.push(fullMessage);

    // Broadcast the message
    broadcastMessage(clientInfo.room, fullMessage);
}

function handleLeave(ws: WebSocket) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) return;

    const leaveMessage: Message = {
        type: 'leave',
        room: clientInfo.room,
        username: clientInfo.username,
        content: `${clientInfo.username} left the room`,
        timestamp: new Date()
    };

    // Broadcast leave message and remove client
    broadcastMessage(clientInfo.room, leaveMessage);
    clients.delete(ws);
}

function broadcastMessage(room: string, message: Message) {
    wss.clients.forEach((client) => {
        const clientInfo = clients.get(client);
        if (client.readyState === WebSocket.OPEN && clientInfo?.room === room) {
            client.send(JSON.stringify(message));
        }
    });
}

app.get('/', (req, res) => {
    res.send('WebSocket Chat Server');
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
