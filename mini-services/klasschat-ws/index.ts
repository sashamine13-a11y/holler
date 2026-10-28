import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses it for port forwarding
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ============================================================================
// Types (mirror of client types)
// ============================================================================

interface OnlineUser {
  socketId: string
  userId: string
  name: string
  role: 'member' | 'admin'
  avatar?: string
  joinedAt: number
}

interface WSMessage {
  id: string
  authorId: string
  authorName: string
  role?: 'member' | 'admin'
  text: string
  ts: number
  anon?: boolean
  image?: string
}

interface WSPoll {
  id: string
  room: string
  q: string
  options: { t: string; votes: string[] }[]
  ts: number
  authorId: string
}

interface WSPinned {
  room: string
  text: string
  ts: number
}

// ============================================================================
// State
// ============================================================================

const onlineUsers = new Map<string, OnlineUser>() // socketId → user

// ============================================================================
// Helpers
// ============================================================================

function emitOnlineList() {
  const list = Array.from(onlineUsers.values()).map(u => ({
    userId: u.userId,
    name: u.name,
    role: u.role,
    avatar: u.avatar,
    joinedAt: u.joinedAt,
  }))
  io.emit('members-update', { members: list })
}

// ============================================================================
// Connection handler
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[WS] connected: ${socket.id}`)

  // -------------------------------------------------------------------------
  // Identify: client sends user info after joining the app
  // -------------------------------------------------------------------------
  socket.on('identify', (data: { userId: string; name: string; role: 'member' | 'admin'; avatar?: string }) => {
    if (!data || typeof data.userId !== 'string' || typeof data.name !== 'string') {
      return
    }
    const user: OnlineUser = {
      socketId: socket.id,
      userId: data.userId,
      name: data.name.slice(0, 32),
      role: data.role === 'admin' ? 'admin' : 'member',
      avatar: data.avatar,
      joinedAt: Date.now(),
    }
    onlineUsers.set(socket.id, user)
    console.log(`[WS] identified: ${user.name} (${user.userId}) — online: ${onlineUsers.size}`)
    emitOnlineList()
  })

  // -------------------------------------------------------------------------
  // Broadcast new message to everyone in same room
  // -------------------------------------------------------------------------
  socket.on('message:new', (payload: { roomId: string; message: WSMessage }) => {
    if (!payload || !payload.roomId || !payload.message) return
    socket.broadcast.emit('message:new', payload)
  })

  // -------------------------------------------------------------------------
  // Broadcast new poll
  // -------------------------------------------------------------------------
  socket.on('poll:new', (payload: { poll: WSPoll }) => {
    if (!payload || !payload.poll) return
    socket.broadcast.emit('poll:new', payload)
  })

  // -------------------------------------------------------------------------
  // Broadcast poll vote
  // -------------------------------------------------------------------------
  socket.on('poll:vote', (payload: { pollId: string; optionIndex: number; voterId: string }) => {
    if (!payload || !payload.pollId) return
    socket.broadcast.emit('poll:vote', payload)
  })

  // -------------------------------------------------------------------------
  // Broadcast pinned message
  // -------------------------------------------------------------------------
  socket.on('pin:update', (payload: { pinned: WSPinned | null }) => {
    socket.broadcast.emit('pin:update', payload)
  })

  // -------------------------------------------------------------------------
  // Broadcast room created / deleted
  // -------------------------------------------------------------------------
  socket.on('room:update', () => {
    socket.broadcast.emit('room:update')
  })

  // -------------------------------------------------------------------------
  // Typing indicator (optional, lightweight)
  // -------------------------------------------------------------------------
  socket.on('typing', (payload: { roomId: string; userId: string; name: string; isTyping: boolean }) => {
    if (!payload || !payload.roomId) return
    socket.broadcast.emit('typing', payload)
  })

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id)
    if (user) {
      onlineUsers.delete(socket.id)
      console.log(`[WS] disconnected: ${user.name} — online: ${onlineUsers.size}`)
      emitOnlineList()
    } else {
      console.log(`[WS] anonymous disconnect: ${socket.id}`)
    }
  })

  socket.on('error', (err) => {
    console.error(`[WS] socket error (${socket.id}):`, err)
  })
})

// ============================================================================
// Start
// ============================================================================

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[klasschat-ws] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[klasschat-ws] SIGTERM, shutting down...')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[klasschat-ws] SIGINT, shutting down...')
  httpServer.close(() => process.exit(0))
})
