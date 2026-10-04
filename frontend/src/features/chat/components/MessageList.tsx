import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/chatStore';
import { useWebRTC } from '../../call/hooks/useWebRTC';
import { getMessagesApi, reactMessageApi, editMessageApi, deleteMessageApi } from '../api';
import { UserAvatar } from '../../../components/shared/UserAvatar';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import {
  Loader2,
  Check,
  CheckCheck,
  FileText,
  Download,
  Smile,
  Pencil,
  Trash2,
  X,
  Ban,
  PhoneOff,
  Video,
  Check as CheckIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface MessageListProps {
  conversationId: string;
}

const EMOJI_LIST = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

const formatCallDurationText = (seconds?: number) => {
  if (!seconds || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const MessageList = ({ conversationId }: MessageListProps) => {
  const { user } = useAuthStore();
  const { initCall } = useWebRTC();
  const {
    messages,
    activeConversation,
    typingUsers,
    setMessages,
    prependOlderMessages,
    updateSingleMessageInStore,
    cursors,
    hasMoreMap,
  } = useChatStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  const currentTypingList = typingUsers[conversationId] || [];
  const friend = activeConversation?.members?.find((m) => m && m._id !== user?._id);
  const typingMembers = (activeConversation?.members || []).filter(
    (m) => m && m._id !== user?._id && currentTypingList.includes(m._id)
  );

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const currentMessages = messages[conversationId] || [];
  const nextCursor = cursors[conversationId] ?? null;
  const hasMore = hasMoreMap[conversationId] ?? false;

  const fetchInitialMessages = async () => {
    try {
      setIsLoading(true);
      const res = await getMessagesApi(conversationId);
      setMessages(
        conversationId,
        res.data.messages,
        res.data.nextCursor,
        res.data.hasMore
      );
    } catch (err) {
      console.error('Lỗi khi tải danh sách tin nhắn:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!messages[conversationId]) {
      fetchInitialMessages();
    }
  }, [conversationId]);

  // Tự động đóng bảng Emoji reaction hoặc hủy chỉnh sửa khi click ra ngoài khoảng trống
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (activeReactionPickerId && !target.closest('.reaction-picker-bar')) {
        setActiveReactionPickerId(null);
      }

      if (editingMessageId && !target.closest('.inline-edit-container')) {
        setEditingMessageId(null);
      }
    };

    if (activeReactionPickerId || editingMessageId) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => {
        window.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [activeReactionPickerId, editingMessageId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, typingMembers.length]);

  const handleScroll = async () => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMore || !hasMore || !nextCursor) return;

    if (container.scrollTop === 0) {
      try {
        setIsLoadingMore(true);
        const oldScrollHeight = container.scrollHeight;

        const res = await getMessagesApi(conversationId, nextCursor);
        prependOlderMessages(
          conversationId,
          res.data.messages,
          res.data.nextCursor,
          res.data.hasMore
        );

        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight - oldScrollHeight;
          }
        });
      } catch (err) {
        console.error('Lỗi khi tải thêm tin nhắn cũ:', err);
      } finally {
        setIsLoadingMore(false);
      }
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    try {
      setActiveReactionPickerId(null);
      const res = await reactMessageApi(messageId, emoji);
      updateSingleMessageInStore(conversationId, res.data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi thả cảm xúc');
    }
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return;
    try {
      const res = await editMessageApi(messageId, editText.trim());
      updateSingleMessageInStore(conversationId, res.data.message);
      setEditingMessageId(null);
      toast.success('Đã chỉnh sửa tin nhắn');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Chỉnh sửa thất bại');
    }
  };

  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deletingMessageId) return;
    try {
      setIsDeleting(true);
      const res = await deleteMessageApi(deletingMessageId);
      updateSingleMessageInStore(conversationId, res.data.message);
      toast.success('Đã thu hồi tin nhắn');
      setDeletingMessageId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thu hồi thất bại');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatTimeSafely = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-background select-none"
      >
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        )}

        {currentMessages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
          </div>
        ) : (
          currentMessages.map((msg) => {
            const senderId =
              typeof msg.sender === 'object' && msg.sender !== null
                ? msg.sender._id
                : msg.sender;
            const isSender = senderId === user?._id;
            const senderFullName =
              typeof msg.sender === 'object' && msg.sender !== null
                ? msg.sender.fullName
                : '';
            const senderAvatar =
              typeof msg.sender === 'object' && msg.sender !== null
                ? msg.sender.avatar
                : '';

            const seenList = msg.seenBy || [];
            const isSeenByOthers = seenList.some((id) => id !== user?._id);

            const reactionsMap: Record<string, number> = {};
            (msg.reactions || []).forEach((r) => {
              reactionsMap[r.emoji] = (reactionsMap[r.emoji] || 0) + 1;
            });

            const isEditing = editingMessageId === msg._id;

            return (
              <div
                key={msg._id}
                className={`group relative flex gap-2.5 max-w-[85%] sm:max-w-[75%] ${
                  isSender ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {!isSender && (
                  <UserAvatar
                    fullName={senderFullName}
                    avatar={senderAvatar}
                    size="sm"
                    className="mt-1"
                  />
                )}

                <div className={`space-y-1 min-w-0 flex flex-col ${isSender ? 'items-end' : 'items-start'}`}>
                  {!isSender && activeConversation?.isGroup && (
                    <span className="text-[11px] font-bold text-muted-foreground pl-1 block">
                      {senderFullName}
                    </span>
                  )}

                  <div className="relative group/bubble max-w-full">
                    {!msg.isDeleted && (
                      <div
                        className={`reaction-picker-bar absolute top-1/2 -translate-y-1/2 items-center gap-1 z-20 bg-card border border-border rounded-full shadow-md p-1 backdrop-blur-md ${
                          activeReactionPickerId === msg._id ? 'flex' : 'hidden group-hover/bubble:flex'
                        } ${
                          isSender
                            ? 'right-full mr-1.5 before:absolute before:inset-y-0 before:-right-3 before:w-4'
                            : 'left-full ml-1.5 before:absolute before:inset-y-0 before:-left-3 before:w-4'
                        }`}
                      >
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveReactionPickerId(
                                activeReactionPickerId === msg._id ? null : msg._id
                              )
                            }
                            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
                            title="Thả cảm xúc"
                          >
                            <Smile className="w-4 h-4" />
                          </button>

                          {activeReactionPickerId === msg._id && (
                            <div className="reaction-picker-bar absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card border border-border rounded-full p-2 shadow-xl animate-in zoom-in-90 duration-150 z-30">
                              {EMOJI_LIST.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReact(msg._id, emoji)}
                                  className="hover:scale-125 transition-transform text-lg"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {isSender && msg.type === 'text' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(msg._id);
                              setEditText(msg.content);
                            }}
                            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
                            title="Chỉnh sửa tin nhắn"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isSender && (
                          <button
                            type="button"
                            onClick={() => setDeletingMessageId(msg._id)}
                            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-destructive transition-colors"
                            title="Thu hồi tin nhắn"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    <div
                      className={`p-3 rounded-2xl text-sm leading-relaxed shadow-xs inline-block max-w-full text-left ${
                        msg.isDeleted
                          ? 'bg-muted/40 text-muted-foreground italic border border-border/50'
                          : msg.type === 'call'
                          ? 'bg-transparent p-0 shadow-none border-none'
                          : isSender
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-card border border-border/80 text-foreground rounded-tl-none'
                      }`}
                    >
                      {msg.isDeleted ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                          <Ban className="w-4 h-4" />
                          <span>Tin nhắn đã bị xóa</span>
                        </div>
                      ) : isEditing ? (
                        <div className="inline-edit-container space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2 bg-background text-foreground text-xs rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                            rows={2}
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingMessageId(null)}
                              className="px-2 py-1 text-xs rounded-md hover:bg-muted text-muted-foreground"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(msg._id)}
                              className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground font-semibold flex items-center gap-1"
                            >
                              <CheckIcon className="w-3.5 h-3.5" /> Lưu
                            </button>
                          </div>
                        </div>
                      ) : msg.type === 'call' ? (
                        <div className="w-60 sm:w-68 p-3 rounded-2xl bg-card border border-border/80 shadow-md text-foreground space-y-2.5">
                          <div className="flex items-center gap-3">
                            {/* Icon Pill */}
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                msg.callStatus === 'missed' ||
                                msg.callStatus === 'declined' ||
                                msg.callStatus === 'busy'
                                  ? 'bg-destructive/15 text-destructive'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {msg.callStatus === 'missed' ||
                              msg.callStatus === 'declined' ||
                              msg.callStatus === 'busy' ? (
                                <PhoneOff className="w-4 h-4" />
                              ) : (
                                <Video className="w-4 h-4" />
                              )}
                            </div>

                            {/* Info & Timestamp */}
                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-xs sm:text-sm leading-tight text-foreground truncate">
                                {msg.callStatus === 'missed' && 'Đã nhỡ cuộc gọi video'}
                                {msg.callStatus === 'declined' && 'Cuộc gọi video bị từ chối'}
                                {msg.callStatus === 'busy' && 'Cuộc gọi video bị bận'}
                                {msg.callStatus === 'completed' &&
                                  `Cuộc gọi video (${formatCallDurationText(msg.callDuration)})`}
                              </h4>
                              <span className="text-[11px] text-muted-foreground mt-0.5 block font-medium">
                                {formatTimeSafely(msg.createdAt)}
                              </span>
                            </div>
                          </div>

                          {/* Call Back Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!activeConversation?.isGroup && friend) {
                                initCall(conversationId, friend._id, {
                                  _id: friend._id,
                                  fullName: friend.fullName,
                                  avatar: friend.avatar,
                                  username: friend.username,
                                });
                              }
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-muted/80 hover:bg-muted font-semibold text-xs text-foreground transition-colors flex items-center justify-center gap-2 border border-border/60 shadow-xs"
                          >
                            <Video className="w-3.5 h-3.5 text-primary" />
                            <span>Gọi lại</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {msg.type === 'image' && msg.mediaUrl && (
                            <div className="mb-2 overflow-hidden rounded-xl border border-black/10 max-w-[300px] sm:max-w-[360px]">
                              <img
                                src={msg.mediaUrl}
                                alt="Attachment"
                                onClick={() => setPreviewImageUrl(msg.mediaUrl || null)}
                                className="max-h-72 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity rounded-xl"
                              />
                            </div>
                          )}

                          {msg.type === 'file' && msg.mediaUrl && (
                            <div className="mb-2 p-2.5 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-between gap-3 border border-black/10">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-lg bg-card text-primary flex-shrink-0">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-xs truncate">
                                    {msg.fileName || 'Tập tin'}
                                  </p>
                                  <p className="text-[11px] opacity-80">
                                    {formatFileSize(msg.fileSize)}
                                  </p>
                                </div>
                              </div>
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={msg.fileName}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                                title="Tải xuống"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}

                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          )}

                          <div
                            className={`text-[10px] mt-1 flex items-center justify-end gap-1.5 font-medium ${
                              isSender
                                ? 'text-primary-foreground/80'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {msg.isEdited && <span>(đã chỉnh sửa)</span>}
                            <span>{formatTimeSafely(msg.createdAt)}</span>

                            {isSender && (
                              <span title={isSeenByOthers ? 'Đã xem' : 'Đã gửi'}>
                                {isSeenByOthers ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-primary-foreground font-bold" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 opacity-70" />
                                )}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {Object.keys(reactionsMap).length > 0 && (
                    <div className={`flex items-center gap-1 pt-0.5 ${isSender ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(reactionsMap).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReact(msg._id, emoji)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-xs shadow-2xs hover:scale-105 transition-transform"
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span className="font-semibold text-[10px] text-muted-foreground">{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
              </div>
            );
          })
        )}

        {/* Typing Indicator Chat Bubble */}
        {typingMembers.map((member) => (
          <div
            key={member._id}
            className="flex gap-2.5 mr-auto max-w-[70%] items-end mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none"
          >
            <UserAvatar fullName={member.fullName} avatar={member.avatar} size="sm" />
            <div className="flex flex-col items-start">
              {activeConversation?.isGroup && (
                <span className="text-[11px] text-muted-foreground font-semibold ml-1 mb-1">
                  {member.fullName}
                </span>
              )}
              <div className="px-4 py-3 rounded-2xl rounded-bl-xs bg-muted/80 dark:bg-card border border-border/80 text-foreground shadow-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot-1" />
                <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot-2" />
                <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot-3" />
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Full-Screen Image Preview Modal */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <button
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 p-2 text-white bg-black/50 hover:bg-black/80 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImageUrl}
            alt="Full Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingMessageId}
        onClose={() => setDeletingMessageId(null)}
        onConfirm={handleDeleteConfirm}
        title="Thu hồi tin nhắn"
        description="Bạn có chắc chắn muốn thu hồi tin nhắn này không? Tin nhắn sẽ được chuyển thành 'Tin nhắn đã bị xóa' với tất cả mọi người."
        confirmText="Thu hồi"
        cancelText="Hủy"
        variant="destructive"
        isLoading={isDeleting}
      />
    </>
  );
};
