import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/chatStore';
import { useWebRTC } from '../../call/hooks/useWebRTC';
import { UserAvatar } from '../../../components/shared/UserAvatar';
import { Phone, Video, Users } from 'lucide-react';
import type { ConversationItem } from '../api';

interface ChatHeaderProps {
  conversation: ConversationItem;
}

export const ChatHeader = ({ conversation }: ChatHeaderProps) => {
  const { user } = useAuthStore();
  const { typingUsers } = useChatStore();
  const { initCall } = useWebRTC();

  const friend = conversation.isGroup
    ? null
    : conversation.members?.find((m) => m._id !== user?._id) || conversation.members?.[0];

  const currentTypingList = typingUsers[conversation._id] || [];

  // Tìm người đang gõ trong nhóm/hội thoại
  const typingUserObj = conversation.members?.find(
    (m) => m._id !== user?._id && currentTypingList.includes(m._id)
  );

  return (
    <div className="h-16 px-6 border-b border-border bg-card flex items-center justify-between flex-none select-none">
      {/* User / Group Info */}
      <div className="flex items-center gap-3">
        {conversation.isGroup ? (
          conversation.groupAvatar ? (
            <img
              src={conversation.groupAvatar}
              alt={conversation.groupName || 'Nhóm'}
              className="w-10 h-10 rounded-full object-cover border border-primary/20 flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shadow-inner flex-shrink-0 border border-primary/20">
              <Users className="w-5 h-5" />
            </div>
          )
        ) : (
          <UserAvatar
            fullName={friend?.fullName}
            avatar={friend?.avatar}
            isOnline={friend?.isOnline}
            showStatus
            size="md"
          />
        )}

        <div>
          <h2 className="text-sm font-bold text-foreground">
            {conversation.isGroup
              ? conversation.groupName || 'Nhóm trò chuyện'
              : friend?.fullName}
          </h2>
          <p className="text-xs text-muted-foreground">
            {typingUserObj ? (
              <span className="text-primary font-semibold animate-pulse">
                {conversation.isGroup
                  ? `${typingUserObj.fullName} đang gõ...`
                  : 'Đang gõ...'}
              </span>
            ) : conversation.isGroup ? (
              <span>{conversation.members?.length || 0} thành viên</span>
            ) : friend?.isOnline ? (
              <span className="text-success font-medium">Đang hoạt động</span>
            ) : (
              'Ngoại tuyến'
            )}
          </p>
        </div>
      </div>

      {/* Action Icons */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <button
          className="p-2 rounded-full hover:bg-muted hover:text-foreground transition-colors opacity-50 cursor-not-allowed"
          title="Cuộc gọi thoại (Tính năng đang phát triển)"
        >
          <Phone className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (!conversation.isGroup && friend) {
              initCall(conversation._id, friend._id, {
                _id: friend._id,
                fullName: friend.fullName,
                avatar: friend.avatar,
                username: friend.username,
              });
            }
          }}
          disabled={conversation.isGroup}
          className={`p-2 rounded-full hover:bg-muted transition-colors ${
            conversation.isGroup
              ? 'opacity-40 cursor-not-allowed text-muted-foreground'
              : 'text-primary hover:bg-primary/10'
          }`}
          title={conversation.isGroup ? 'Cuộc gọi video chỉ hỗ trợ chat 1-1' : 'Gọi video'}
        >
          <Video className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

