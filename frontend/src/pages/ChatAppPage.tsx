import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { ConversationList } from '../features/chat/components/ConversationList';
import { ChatHeader } from '../features/chat/components/ChatHeader';
import { MessageList } from '../features/chat/components/MessageList';
import { MessageInput } from '../features/chat/components/MessageInput';
import { FriendsModal } from '../features/friends/components/FriendsModal';
import {
  getConversationsApi,
  getMessagesApi,
  markConversationAsReadApi,
  type MessageItem,
  type ConversationItem,
} from '../features/chat/api';
import { getSocket } from '../lib/socket';
import { MessageSquare, Lock } from 'lucide-react';
import { toast } from 'sonner';

export const ChatAppPage = () => {
  const { user } = useAuthStore();
  const {
    activeConversation,
    setConversations,
    setMessages,
    addMessage,
    updateConversation,
    updateSingleMessageInStore,
    markAsReadInStore,
    markMessageSeenInStore,
    removeConversationFromStore,
    setTypingUser,
  } = useChatStore();

  const [isFriendsOpen, setIsFriendsOpen] = useState(false);

  // Fetch initial conversations list
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await getConversationsApi();
      setConversations(res.data.conversations);
    } catch (err) {
      console.error('Lỗi khi tải cuộc trò chuyện:', err);
    }
  };

  // When active conversation changes: fetch its messages & join socket room & mark as read
  useEffect(() => {
    if (!activeConversation) return;

    const convId = activeConversation._id;

    // Load initial messages for active conversation
    loadActiveMessages(convId);

    // Socket join room & mark as read
    const socket = getSocket();
    if (socket) {
      socket.emit('conversation:join', { conversationId: convId });
    }

    // Mark as read if user has unread messages
    const unreadCount = activeConversation.unreadCount
      ? activeConversation.unreadCount[user?._id || ''] || 0
      : 0;

    if (user && unreadCount > 0) {
      markConversationAsReadApi(convId)
        .then(() => {
          markAsReadInStore(convId, user._id);
        })
        .catch(console.error);
    }

    return () => {
      if (socket) {
        socket.emit('conversation:leave', { conversationId: convId });
      }
    };
  }, [activeConversation?._id]);

  const loadActiveMessages = async (convId: string) => {
    try {
      const res = await getMessagesApi(convId);
      setMessages(
        convId,
        res.data.messages,
        res.data.nextCursor,
        res.data.hasMore
      );
    } catch (err: any) {
      console.error('Lỗi khi tải tin nhắn:', err);
      toast.error(err.response?.data?.message || 'Lỗi khi tải lịch sử tin nhắn');
    }
  };

  // Global Socket Listeners for Realtime Messaging
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = ({
      message,
      conversation,
    }: {
      message: MessageItem;
      conversation: ConversationItem;
    }) => {
      addMessage(message.conversation, message);
      if (conversation) {
        updateConversation(conversation);
      }

      // Automatically mark read if this conversation is currently open
      if (activeConversation?._id === message.conversation && user) {
        markConversationAsReadApi(message.conversation)
          .then(() => markAsReadInStore(message.conversation, user._id))
          .catch(console.error);
      }
    };

    const handleConversationUpdate = ({
      conversation,
      message,
    }: {
      conversation: ConversationItem;
      message?: MessageItem;
    }) => {
      updateConversation(conversation);
      if (message) {
        addMessage(conversation._id, message);
      }
    };

    const handleConversationRemove = ({ conversationId }: { conversationId: string }) => {
      removeConversationFromStore(conversationId);
      toast.info('Bạn đã không còn ở trong cuộc trò chuyện này');
    };

    const handleMessageSeen = ({
      conversationId,
      userId: seenUserId,
      updatedMessageIds,
    }: {
      conversationId: string;
      userId: string;
      updatedMessageIds?: string[];
    }) => {
      markMessageSeenInStore(conversationId, seenUserId, updatedMessageIds);
    };

    const handleMessageReact = ({ message }: { message: MessageItem }) => {
      updateSingleMessageInStore(message.conversation, message);
    };

    const handleMessageEdit = ({ message }: { message: MessageItem }) => {
      updateSingleMessageInStore(message.conversation, message);
    };

    const handleMessageDelete = ({ message }: { message: MessageItem }) => {
      updateSingleMessageInStore(message.conversation, message);
    };

    const handleTypingStart = ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      setTypingUser(conversationId, userId, true);
    };

    const handleTypingStop = ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      setTypingUser(conversationId, userId, false);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('conversation:update', handleConversationUpdate);
    socket.on('conversation:remove', handleConversationRemove);
    socket.on('message:seen', handleMessageSeen);
    socket.on('message:react', handleMessageReact);
    socket.on('message:edit', handleMessageEdit);
    socket.on('message:delete', handleMessageDelete);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:update', handleConversationUpdate);
      socket.off('conversation:remove', handleConversationRemove);
      socket.off('message:seen', handleMessageSeen);
      socket.off('message:react', handleMessageReact);
      socket.off('message:edit', handleMessageEdit);
      socket.off('message:delete', handleMessageDelete);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
    };
  }, [
    activeConversation?._id,
    user?._id,
    addMessage,
    updateConversation,
    updateSingleMessageInStore,
    removeConversationFromStore,
    markAsReadInStore,
    markMessageSeenInStore,
    setTypingUser,
  ]);

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Sidebar: Conversation List */}
      <ConversationList onOpenFriendsModal={() => setIsFriendsOpen(true)} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-background min-w-0">
        {activeConversation ? (
          <>
            <ChatHeader conversation={activeConversation} />
            <MessageList conversationId={activeConversation._id} />
            <MessageInput conversationId={activeConversation._id} />
          </>
        ) : (
          /* Empty Chat State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10 select-none space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <MessageSquare className="w-10 h-10" />
            </div>

            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                WhatsApp Web
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gửi và nhận tin nhắn thời gian thực mà không cần giữ điện thoại kết nối internet.
              </p>
            </div>

            <button
              onClick={() => setIsFriendsOpen(true)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm"
            >
              + Bắt đầu trò chuyện với Bạn bè
            </button>

            <div className="pt-12 text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Tin nhắn được bảo mật riêng tư</span>
            </div>
          </div>
        )}
      </div>

      {/* Friends Modal */}
      <FriendsModal isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)} />
    </div>
  );
};
