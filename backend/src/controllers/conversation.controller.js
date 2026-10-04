import {
  getOrCreateDirectConversation,
  getUserConversations,
  createGroupConversation,
  addGroupMembers,
  removeGroupMember,
  updateGroupInfo,
} from '../services/conversation.service.js';
import {
  createNewMessage,
  getConversationMessages,
  markConversationAsRead,
  toggleMessageReaction,
  editMessageContent,
  softDeleteMessage,
} from '../services/message.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getIO } from '../sockets/index.js';

export const getOrCreateDirect = async (req, res, next) => {
  try {
    const { friendId } = req.params;
    const conversation = await getOrCreateDirectConversation(req.userId, friendId);
    return res
      .status(200)
      .json(
        new ApiResponse(200, { conversation }, 'Tạo hoặc lấy conversation thành công')
      );
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (req, res, next) => {
  try {
    const conversations = await getUserConversations(req.userId);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { conversations },
          'Lấy danh sách cuộc trò chuyện thành công'
        )
      );
  } catch (error) {
    next(error);
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const { groupName, groupAvatar, memberIds } = req.body;
    const conversation = await createGroupConversation({
      creatorId: req.userId,
      groupName,
      groupAvatar,
      memberIds,
    });

    // Phát sóng qua socket để các thành viên nhận được cuộc trò chuyện mới ngay lập tức
    try {
      const io = getIO();
      conversation.members.forEach((member) => {
        const memberId = member._id ? member._id.toString() : member.toString();
        io.to(`user:${memberId}`).emit('conversation:update', { conversation });
      });
    } catch (e) {
      console.error('Lỗi socket khi tạo nhóm:', e);
    }

    return res
      .status(201)
      .json(new ApiResponse(201, { conversation }, 'Tạo nhóm thành công'));
  } catch (error) {
    next(error);
  }
};

export const addMembers = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { memberIds } = req.body;
    const conversation = await addGroupMembers({
      conversationId,
      adminId: req.userId,
      newMemberIds: memberIds,
    });

    try {
      const io = getIO();
      conversation.members.forEach((member) => {
        const memberId = member._id ? member._id.toString() : member.toString();
        io.to(`user:${memberId}`).emit('conversation:update', { conversation });
      });
    } catch (e) {
      console.error('Lỗi socket khi thêm thành viên:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { conversation }, 'Thêm thành viên thành công'));
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const { id: conversationId, userId: targetUserId } = req.params;
    const conversation = await removeGroupMember({
      conversationId,
      requesterId: req.userId,
      targetUserId,
    });

    try {
      const io = getIO();
      // Thông báo cho các thành viên còn lại
      conversation.members.forEach((member) => {
        const memberId = member._id ? member._id.toString() : member.toString();
        io.to(`user:${memberId}`).emit('conversation:update', { conversation });
      });
      // Thông báo cho thành viên bị xóa
      io.to(`user:${targetUserId}`).emit('conversation:remove', { conversationId });
    } catch (e) {
      console.error('Lỗi socket khi xóa thành viên:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { conversation }, 'Cập nhật danh sách thành viên thành công'));
  } catch (error) {
    next(error);
  }
};

export const updateGroup = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { groupName, groupAvatar } = req.body;
    const conversation = await updateGroupInfo({
      conversationId,
      requesterId: req.userId,
      groupName,
      groupAvatar,
    });

    try {
      const io = getIO();
      conversation.members.forEach((member) => {
        const memberId = member._id ? member._id.toString() : member.toString();
        io.to(`user:${memberId}`).emit('conversation:update', { conversation });
      });
    } catch (e) {
      console.error('Lỗi socket khi cập nhật nhóm:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { conversation }, 'Cập nhật thông tin nhóm thành công'));
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { cursor, limit } = req.query;

    const sanitizedCursor =
      cursor && cursor !== 'undefined' && cursor !== 'null' && String(cursor).trim() !== ''
        ? String(cursor)
        : undefined;

    const data = await getConversationMessages({
      conversationId,
      userId: req.userId,
      cursor: sanitizedCursor,
      limit: limit ? Number(limit) : 30,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, data, 'Lấy danh sách tin nhắn thành công'));
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { content, type, mediaUrl, fileName, fileSize } = req.body;

    const data = await createNewMessage({
      conversationId,
      senderId: req.userId,
      content,
      type,
      mediaUrl,
      fileName,
      fileSize,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, data, 'Gửi tin nhắn thành công'));
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { conversation, updatedMessageIds } = await markConversationAsRead(
      conversationId,
      req.userId
    );

    try {
      const io = getIO();
      io.to(`conversation:${conversationId}`).emit('message:seen', {
        conversationId,
        userId: req.userId,
        updatedMessageIds,
      });
    } catch (e) {
      console.error('Lỗi socket khi emit message:seen:', e);
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, { conversation }, 'Đã đánh dấu cuộc trò chuyện đã đọc')
      );
  } catch (error) {
    next(error);
  }
};

export const reactToMessage = async (req, res, next) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body;

    const message = await toggleMessageReaction({
      messageId,
      userId: req.userId,
      emoji,
    });

    try {
      const io = getIO();
      io.to(`conversation:${message.conversation}`).emit('message:react', {
        message,
      });
    } catch (e) {
      console.error('Lỗi socket khi emit message:react:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { message }, 'Cập nhật cảm xúc thành công'));
  } catch (error) {
    next(error);
  }
};

export const editMessage = async (req, res, next) => {
  try {
    const { id: messageId } = req.params;
    const { content } = req.body;

    const message = await editMessageContent({
      messageId,
      senderId: req.userId,
      content,
    });

    try {
      const io = getIO();
      io.to(`conversation:${message.conversation}`).emit('message:edit', {
        message,
      });
    } catch (e) {
      console.error('Lỗi socket khi emit message:edit:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { message }, 'Chỉnh sửa tin nhắn thành công'));
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const { id: messageId } = req.params;

    const message = await softDeleteMessage({
      messageId,
      senderId: req.userId,
    });

    try {
      const io = getIO();
      io.to(`conversation:${message.conversation}`).emit('message:delete', {
        message,
      });
    } catch (e) {
      console.error('Lỗi socket khi emit message:delete:', e);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { message }, 'Thu hồi tin nhắn thành công'));
  } catch (error) {
    next(error);
  }
};

