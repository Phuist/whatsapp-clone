import { Message } from '../models/message.model.js';
import { Conversation } from '../models/conversation.model.js';
import { ApiError } from '../utils/apiError.js';

export const createNewMessage = async ({
  conversationId,
  senderId,
  content,
  type = 'text',
  mediaUrl,
  fileName,
  fileSize,
  callType = 'video',
  callStatus = 'completed',
  callDuration = 0,
}) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Không tìm thấy cuộc trò chuyện');
  }

  const isMember = conversation.members.some(
    (memberId) => memberId.toString() === senderId
  );
  if (!isMember) {
    throw new ApiError(403, 'Bạn không phải là thành viên của cuộc trò chuyện này');
  }

  const message = await Message.create({
    conversation: conversationId,
    sender: senderId,
    content: content ? content.trim() : '',
    type,
    mediaUrl: mediaUrl || '',
    fileName: fileName || '',
    fileSize: fileSize || 0,
    callType,
    callStatus,
    callDuration,
    seenBy: [senderId],
  });

  // Cập nhật lastMessage và tăng unreadCount cho các thành viên khác
  conversation.lastMessage = message._id;

  const currentUnread = conversation.unreadCount || new Map();
  conversation.members.forEach((memberId) => {
    const mIdStr = memberId.toString();
    if (mIdStr !== senderId) {
      const prevCount = currentUnread.get(mIdStr) || 0;
      currentUnread.set(mIdStr, prevCount + 1);
    }
  });
  conversation.unreadCount = currentUnread;
  await conversation.save();

  const populatedMessage = await Message.findById(message._id).populate(
    'sender',
    '_id username fullName avatar'
  );

  const populatedConversation = await Conversation.findById(conversationId)
    .populate('members', '_id username fullName email avatar isOnline lastSeenAt')
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'sender',
        select: '_id username fullName',
      },
    });

  return { message: populatedMessage, conversation: populatedConversation };
};

export const getConversationMessages = async ({
  conversationId,
  userId,
  cursor,
  limit = 30,
}) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Không tìm thấy cuộc trò chuyện');
  }

  const userIdStr = userId?._id ? userId._id.toString() : userId?.toString();
  const isMember = conversation.members.some((member) => {
    const memberIdStr = member?._id ? member._id.toString() : member?.toString();
    return memberIdStr === userIdStr;
  });
  if (!isMember) {
    throw new ApiError(403, 'Bạn không có quyền xem tin nhắn cuộc trò chuyện này');
  }

  const query = { conversation: conversationId };
  if (cursor) {
    query._id = { $lt: cursor };
  }

  const messages = await Message.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('sender', '_id username fullName avatar')
    .populate('reactions.user', '_id username fullName avatar');

  let hasMore = false;
  let nextCursor = null;

  if (messages.length > limit) {
    hasMore = true;
    messages.pop(); // Bỏ tin nhắn dôi ra
    nextCursor = messages[messages.length - 1]._id.toString();
  }

  // Đảo thứ tự để hiển thị theo thời gian xuôi [cũ -> mới] trên giao diện
  messages.reverse();

  return { messages, nextCursor, hasMore };
};

export const markConversationAsRead = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'Không tìm thấy cuộc trò chuyện');
  }

  if (conversation.unreadCount) {
    conversation.unreadCount.set(userId.toString(), 0);
    await conversation.save();
  }

  // Lấy các tin nhắn chưa được user này đọc
  const unreadMessages = await Message.find(
    { conversation: conversationId, seenBy: { $ne: userId } },
    '_id'
  );
  const updatedMessageIds = unreadMessages.map((m) => m._id.toString());

  // Thêm userId vào danh sách seenBy của các tin nhắn chưa đọc
  if (updatedMessageIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: updatedMessageIds } },
      { $addToSet: { seenBy: userId } }
    );
  }

  const populatedConversation = await Conversation.findById(conversationId)
    .populate('members', '_id username fullName email avatar isOnline lastSeenAt')
    .populate('groupAdmin', '_id username fullName avatar')
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'sender',
        select: '_id username fullName',
      },
    });

  return { conversation: populatedConversation, updatedMessageIds };
};

export const toggleMessageReaction = async ({ messageId, userId, emoji }) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new ApiError(404, 'Không tìm thấy tin nhắn');
  }

  if (message.isDeleted) {
    throw new ApiError(400, 'Không thể thả cảm xúc cho tin nhắn đã bị xóa');
  }

  const existingIndex = message.reactions.findIndex(
    (r) => r.user.toString() === userId.toString()
  );

  if (existingIndex > -1) {
    if (message.reactions[existingIndex].emoji === emoji) {
      // Bấm lại đúng emoji cũ -> Bỏ reaction
      message.reactions.splice(existingIndex, 1);
    } else {
      // Đổi sang emoji khác
      message.reactions[existingIndex].emoji = emoji;
    }
  } else {
    // Thêm reaction mới
    message.reactions.push({ user: userId, emoji });
  }

  await message.save();

  const populatedMessage = await Message.findById(message._id)
    .populate('sender', '_id username fullName avatar')
    .populate('reactions.user', '_id username fullName avatar');

  return populatedMessage;
};

export const editMessageContent = async ({ messageId, senderId, content }) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new ApiError(404, 'Không tìm thấy tin nhắn');
  }

  if (message.sender.toString() !== senderId.toString()) {
    throw new ApiError(403, 'Bạn chỉ có thể chỉnh sửa tin nhắn của chính mình');
  }

  if (message.isDeleted) {
    throw new ApiError(400, 'Không thể chỉnh sửa tin nhắn đã bị xóa');
  }

  if (!content || !content.trim()) {
    throw new ApiError(400, 'Nội dung tin nhắn không được để trống');
  }

  message.content = content.trim();
  message.isEdited = true;
  await message.save();

  const populatedMessage = await Message.findById(message._id)
    .populate('sender', '_id username fullName avatar')
    .populate('reactions.user', '_id username fullName avatar');

  return populatedMessage;
};

export const softDeleteMessage = async ({ messageId, senderId }) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new ApiError(404, 'Không tìm thấy tin nhắn');
  }

  if (message.sender.toString() !== senderId.toString()) {
    throw new ApiError(403, 'Bạn chỉ có thể xóa tin nhắn của chính mình');
  }

  message.isDeleted = true;
  message.content = 'Tin nhắn đã bị xóa';
  message.mediaUrl = '';
  message.fileName = '';
  message.fileSize = 0;
  message.reactions = [];
  await message.save();

  const populatedMessage = await Message.findById(message._id)
    .populate('sender', '_id username fullName avatar');

  return populatedMessage;
};
