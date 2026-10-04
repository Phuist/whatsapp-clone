import { create } from 'zustand';
import type { ConversationItem, MessageItem } from '../features/chat/api';

interface ChatState {
  conversations: ConversationItem[];
  activeConversation: ConversationItem | null;
  messages: Record<string, MessageItem[]>;
  typingUsers: Record<string, string[]>; // conversationId -> Array of userIds currently typing
  cursors: Record<string, string | null>;
  hasMoreMap: Record<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  setConversations: (conversations: ConversationItem[]) => void;
  setActiveConversation: (conversation: ConversationItem | null) => void;
  setMessages: (
    conversationId: string,
    messages: MessageItem[],
    nextCursor: string | null,
    hasMore: boolean
  ) => void;
  prependOlderMessages: (
    conversationId: string,
    messages: MessageItem[],
    nextCursor: string | null,
    hasMore: boolean
  ) => void;
  addMessage: (conversationId: string, message: MessageItem) => void;
  updateConversation: (conversation: ConversationItem) => void;
  markAsReadInStore: (conversationId: string, userId: string) => void;
  removeConversationFromStore: (conversationId: string) => void;
  markMessageSeenInStore: (
    conversationId: string,
    userId: string,
    messageIds?: string[]
  ) => void;
  updateSingleMessageInStore: (
    conversationId: string,
    updatedMessage: MessageItem
  ) => void;
  setTypingUser: (conversationId: string, userId: string, isTyping: boolean) => void;
  updateUserPresenceInChat: (userId: string, isOnline: boolean, lastSeenAt?: string) => void;
  setIsLoadingConversations: (loading: boolean) => void;
  setIsLoadingMessages: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversation: null,
  messages: {},
  typingUsers: {},
  cursors: {},
  hasMoreMap: {},
  isLoadingConversations: false,
  isLoadingMessages: false,

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (activeConversation) => set({ activeConversation }),

  setMessages: (conversationId, newMessages, nextCursor, hasMore) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: newMessages },
      cursors: { ...state.cursors, [conversationId]: nextCursor },
      hasMoreMap: { ...state.hasMoreMap, [conversationId]: hasMore },
    })),

  prependOlderMessages: (conversationId, olderMessages, nextCursor, hasMore) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      return {
        messages: { ...state.messages, [conversationId]: [...olderMessages, ...existing] },
        cursors: { ...state.cursors, [conversationId]: nextCursor },
        hasMoreMap: { ...state.hasMoreMap, [conversationId]: hasMore },
      };
    }),

  addMessage: (conversationId, message) =>
    set((state) => {
      const currentList = state.messages[conversationId] || [];
      if (currentList.some((m) => m._id === message._id)) {
        return state;
      }

      const updatedConversations = state.conversations.map((conv) => {
        if (conv._id === conversationId) {
          return {
            ...conv,
            lastMessage: message,
            updatedAt: message.createdAt || new Date().toISOString(),
          };
        }
        return conv;
      });

      updatedConversations.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return {
        messages: { ...state.messages, [conversationId]: [...currentList, message] },
        conversations: updatedConversations,
      };
    }),

  updateConversation: (updatedConv) =>
    set((state) => {
      const exists = state.conversations.some((c) => c._id === updatedConv._id);
      let newConversations: ConversationItem[];

      const isPopulatedMembers = (members?: any[]) =>
        Array.isArray(members) &&
        members.length > 0 &&
        typeof members[0] === 'object' &&
        members[0] !== null &&
        '_id' in members[0];

      if (exists) {
        newConversations = state.conversations.map((c) => {
          if (c._id === updatedConv._id) {
            return {
              ...c,
              ...updatedConv,
              members: isPopulatedMembers(updatedConv.members)
                ? updatedConv.members
                : c.members,
            };
          }
          return c;
        });
      } else {
        newConversations = [updatedConv, ...state.conversations];
      }

      newConversations.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });

      const updatedActive =
        state.activeConversation?._id === updatedConv._id
          ? {
              ...state.activeConversation,
              ...updatedConv,
              members: isPopulatedMembers(updatedConv.members)
                ? updatedConv.members
                : state.activeConversation.members,
            }
          : state.activeConversation;

      return {
        conversations: newConversations,
        activeConversation: updatedActive,
      };
    }),

  removeConversationFromStore: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c._id !== conversationId),
      activeConversation:
        state.activeConversation?._id === conversationId ? null : state.activeConversation,
    })),

  markAsReadInStore: (conversationId, userId) =>
    set((state) => ({
      conversations: state.conversations.map((conv) => {
        if (conv._id === conversationId && conv.unreadCount) {
          const newUnread = { ...conv.unreadCount, [userId]: 0 };
          return { ...conv, unreadCount: newUnread };
        }
        return conv;
      }),
      activeConversation:
        state.activeConversation?._id === conversationId && state.activeConversation.unreadCount
          ? {
              ...state.activeConversation,
              unreadCount: { ...state.activeConversation.unreadCount, [userId]: 0 },
            }
          : state.activeConversation,
    })),

  markMessageSeenInStore: (conversationId, userId, messageIds) =>
    set((state) => {
      const currentMsgs = state.messages[conversationId];
      if (!currentMsgs) return state;

      const updated = currentMsgs.map((msg) => {
        if (!messageIds || messageIds.length === 0 || messageIds.includes(msg._id)) {
          const currentSeen = msg.seenBy || [];
          if (!currentSeen.includes(userId)) {
            return { ...msg, seenBy: [...currentSeen, userId] };
          }
        }
        return msg;
      });

      return {
        messages: { ...state.messages, [conversationId]: updated },
      };
    }),

  updateSingleMessageInStore: (conversationId, updatedMessage) =>
    set((state) => {
      const currentMsgs = state.messages[conversationId] || [];
      const newMsgs = currentMsgs.map((m) =>
        m._id === updatedMessage._id ? updatedMessage : m
      );

      const updatedConversations = state.conversations.map((conv) => {
        if (conv._id === conversationId && conv.lastMessage?._id === updatedMessage._id) {
          return {
            ...conv,
            lastMessage: updatedMessage,
          };
        }
        return conv;
      });

      return {
        messages: { ...state.messages, [conversationId]: newMsgs },
        conversations: updatedConversations,
      };
    }),

  setTypingUser: (conversationId, userId, isTyping) =>
    set((state) => {
      const currentTyping = state.typingUsers[conversationId] || [];
      let updatedTyping: string[];

      if (isTyping) {
        updatedTyping = currentTyping.includes(userId) ? currentTyping : [...currentTyping, userId];
      } else {
        updatedTyping = currentTyping.filter((id) => id !== userId);
      }

      return {
        typingUsers: { ...state.typingUsers, [conversationId]: updatedTyping },
      };
    }),

  updateUserPresenceInChat: (userId, isOnline, lastSeenAt) =>
    set((state) => {
      const updateMember = (m: any) => {
        if (typeof m === 'object' && m !== null && m._id === userId) {
          return {
            ...m,
            isOnline,
            lastSeenAt: lastSeenAt || (isOnline ? m.lastSeenAt : new Date().toISOString()),
          };
        }
        return m;
      };

      const newConversations = state.conversations.map((conv) => ({
        ...conv,
        members: Array.isArray(conv.members) ? conv.members.map(updateMember) : conv.members,
      }));

      const newActive = state.activeConversation
        ? {
            ...state.activeConversation,
            members: Array.isArray(state.activeConversation.members)
              ? state.activeConversation.members.map(updateMember)
              : state.activeConversation.members,
          }
        : state.activeConversation;

      return {
        conversations: newConversations,
        activeConversation: newActive,
      };
    }),

  setIsLoadingConversations: (isLoadingConversations) => set({ isLoadingConversations }),
  setIsLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),
}));
