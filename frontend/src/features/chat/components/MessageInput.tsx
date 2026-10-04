import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Loader2, Smile } from 'lucide-react';
import { getSocket } from '../../../lib/socket';
import { sendMessageApi, uploadFileApi } from '../api';
import { useChatStore } from '../../../store/chatStore';
import { EmojiPicker } from './EmojiPicker';
import { toast } from 'sonner';

interface MessageInputProps {
  conversationId: string;
}

export const MessageInput = ({ conversationId }: MessageInputProps) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { addMessage } = useChatStore();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('typing:start', { conversationId });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { conversationId });
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error('Dung lượng tập tin tối đa 25MB');
      return;
    }

    setAttachedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!text.trim() && !attachedFile) || sending) return;

    const contentToSend = text.trim();
    const currentFile = attachedFile;

    setText('');
    removeAttachedFile();
    setSending(true);

    // Stop typing indicator when sent
    const socket = getSocket();
    if (socket) {
      socket.emit('typing:stop', { conversationId });
    }

    try {
      let type: 'text' | 'image' | 'file' = 'text';
      let mediaUrl = '';
      let fileName = '';
      let fileSize = 0;

      // Upload file to Cloudinary if attached
      if (currentFile) {
        toast.info('Đang tải tập tin lên Cloudinary...');
        const uploadRes = await uploadFileApi(currentFile);
        mediaUrl = uploadRes.data.url;
        fileName = uploadRes.data.fileName;
        fileSize = uploadRes.data.fileSize;
        type = uploadRes.data.type;
      }

      // 1. Send via Socket
      if (socket && socket.connected) {
        socket.emit(
          'message:send',
          {
            conversationId,
            content: contentToSend,
            type,
            mediaUrl,
            fileName,
            fileSize,
          },
          (response: any) => {
            if (response?.status === 'ok' && response?.message) {
              addMessage(conversationId, response.message);
            }
          }
        );
      } else {
        // Fallback to REST API
        const res = await sendMessageApi(conversationId, {
          content: contentToSend,
          type,
          mediaUrl,
          fileName,
          fileSize,
        });
        addMessage(conversationId, res.data.message);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi gửi tin nhắn');
      setText(contentToSend);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col bg-card border-t border-border flex-none select-none">
      {/* File Attachment Preview Banner */}
      {attachedFile && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border/50 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-3 min-w-0">
            {filePreviewUrl ? (
              <img
                src={filePreviewUrl}
                alt="Preview"
                className="w-12 h-12 rounded-lg object-cover border border-border shadow-xs"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <FileText className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {attachedFile.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(attachedFile.size)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={removeAttachedFile}
            className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Form Bar */}
      <form onSubmit={handleSend} className="p-3 sm:p-4 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          id="message-file-attachment"
        />

        <label
          htmlFor="message-file-attachment"
          className="p-2 text-muted-foreground hover:text-primary rounded-full hover:bg-muted transition-colors cursor-pointer"
          title="Đính kèm tập tin/ảnh"
        >
          <Paperclip className="w-5 h-5" />
        </label>

        <input
          type="text"
          placeholder={attachedFile ? 'Thêm chú thích...' : 'Nhập tin nhắn...'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          className="flex-1 h-10 px-4 rounded-xl bg-muted/40 border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
        />

        {/* Emoji Picker Button */}
        <button
          type="button"
          onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
          className={`p-2 rounded-full transition-colors emoji-toggle-btn ${
            isEmojiPickerOpen
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-primary hover:bg-muted'
          }`}
          title="Chọn biểu cảm Emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Emoji Picker Popover */}
        <EmojiPicker
          isOpen={isEmojiPickerOpen}
          onClose={() => setIsEmojiPickerOpen(false)}
          onSelectEmoji={handleSelectEmoji}
        />

        <button
          type="submit"
          disabled={(!text.trim() && !attachedFile) || sending}
          className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
          title="Gửi tin nhắn"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
};
