import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';

import { setupMessageSocket } from './message.socket.js';
import { setupCallSocket } from './call.socket.js';

export const setupPresenceSocket = (io) => {
  // Middleware xác thực JWT cho Socket.io handshake
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Token is required'));
      }

      const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🟢 User connected socket: ${userId} (${socket.id})`);

    // Join room cá nhân của user
    socket.join(`user:${userId}`);

    // Thiết lập các sự kiện tin nhắn & cuộc gọi realtime cho socket
    setupMessageSocket(io, socket);
    setupCallSocket(io, socket);

    // Cập nhật trạng thái online trong DB và phát sóng event user:online
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('user:online', { userId });
    } catch (err) {
      console.error('Lỗi khi cập nhật trạng thái online:', err);
    }

    socket.on('disconnect', async () => {
      console.log(`🔴 User disconnected socket: ${userId} (${socket.id})`);

      // Kiểm tra xem người dùng còn kết nối socket nào khác không (ví dụ ở tab khác)
      const userSockets = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (userSockets && userSockets.size > 0) {
        return;
      }

      const lastSeenAt = new Date();

      try {
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeenAt,
        });
        io.emit('user:offline', { userId, lastSeenAt });
      } catch (err) {
        console.error('Lỗi khi cập nhật trạng thái offline:', err);
      }
    });
  });
};
