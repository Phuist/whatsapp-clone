import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useFriendStore } from '../store/friendStore';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../features/call/callStore';
import {
  answerCall,
  rejectCall,
  endCall,
  handleSignalData,
  handleCallAccepted,
  cleanupWebRTC,
} from '../features/call/hooks/useWebRTC';
import { IncomingCallModal } from '../features/call/components/IncomingCallModal';
import { CallWindow } from '../features/call/components/CallWindow';
import { MessageSquare, Users, Settings, LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';
import { UserAvatar } from '../components/shared/UserAvatar';
import { FriendsModal } from '../features/friends/components/FriendsModal';
import { ProfileModal } from '../features/profile/components/ProfileModal';
import { getFriendsApi, getFriendRequestsApi } from '../features/friends/api';
import { logoutApi } from '../features/auth/api';
import { getSocket, disconnectSocket } from '../lib/socket';
import { toast } from 'sonner';

export const AppLayout = () => {
  const { user, logout } = useAuthStore();
  const { receivedRequests, setFriends, setReceivedRequests, setSentRequests, updateUserPresence } =
    useFriendStore();
  const { updateUserPresenceInChat } = useChatStore();
  const { setRinging, setEnded, resetCall } = useCallStore();

  const navigate = useNavigate();

  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Initial load of friends & friend requests
  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  // Realtime presence & Call socket listeners setup
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleUserOnline = ({ userId }: { userId: string }) => {
      updateUserPresence(userId, true);
      updateUserPresenceInChat(userId, true);
    };

    const handleUserOffline = ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => {
      updateUserPresence(userId, false, lastSeenAt);
      updateUserPresenceInChat(userId, false, lastSeenAt);
    };

    // Lắng nghe các sự kiện Socket Cuộc gọi toàn cục (Global Socket Call Handlers)
    // 1. Nhận được thông báo cuộc gọi đến
    const handleIncomingCall = ({
      fromUserId,
      conversationId,
      fromUserInfo,
    }: {
      fromUserId: string;
      conversationId: string;
      fromUserInfo: any;
    }) => {
      const currentCallStatus = useCallStore.getState().callStatus;
      // Nếu đang bận ở cuộc gọi khác -> Tự động từ chối với lý do 'busy'
      if (currentCallStatus !== 'idle') {
        socket.emit('call:reject', {
          toUserId: fromUserId,
          conversationId,
          reason: 'busy',
        });
        return;
      }
      // Hiển thị modal cuộc gọi đến (bắt đầu đổ chuông)
      setRinging(conversationId, fromUserId, fromUserInfo);
    };

    // 2. Nhận thông báo đối phương đã bấm Chấp nhận nghe
    const handleAcceptedCall = ({ fromUserId }: { fromUserId: string }) => {
      handleCallAccepted(fromUserId);
    };

    // 3. Nhận thông báo đối phương đã Từ chối cuộc gọi
    const handleRejectedCall = ({ reason }: { reason?: string }) => {
      cleanupWebRTC();
      setEnded(reason === 'busy' ? 'Đối phương đang bận' : 'Đã từ chối cuộc gọi');
      setTimeout(() => resetCall(), 1500);
    };

    // 4. Nhận gói tín hiệu WebRTC (SDP Offer/Answer hoặc ICE Candidate)
    const handleSignalCall = ({
      fromUserId,
      signalData,
    }: {
      fromUserId: string;
      signalData: any;
    }) => {
      handleSignalData(fromUserId, signalData);
    };

    // 5. Nhận thông báo đối phương đã cúp máy kết thúc cuộc gọi
    const handleEndedCall = () => {
      cleanupWebRTC();
      setEnded('Cuộc gọi đã kết thúc');
      setTimeout(() => resetCall(), 1500);
    };

    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleAcceptedCall);
    socket.on('call:rejected', handleRejectedCall);
    socket.on('call:signal', handleSignalCall);
    socket.on('call:ended', handleEndedCall);

    return () => {
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleAcceptedCall);
      socket.off('call:rejected', handleRejectedCall);
      socket.off('call:signal', handleSignalCall);
      socket.off('call:ended', handleEndedCall);
    };
  }, [updateUserPresence, updateUserPresenceInChat, setRinging, setEnded, resetCall]);

  const loadInitialData = async () => {
    try {
      const [friendsRes, reqsRes] = await Promise.all([
        getFriendsApi(),
        getFriendRequestsApi(),
      ]);
      setFriends(friendsRes.data.friends);
      setReceivedRequests(reqsRes.data.receivedRequests);
      setSentRequests(reqsRes.data.sentRequests);
    } catch (err) {
      console.error('Lỗi khi tải thông tin bạn bè ban đầu:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (err) {
      // Ignore error during logout
    } finally {
      disconnectSocket();
      logout();
      toast.info('Đã đăng xuất tài khoản');
      navigate('/login');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 1. Nav Rail (64px wide sidebar rail) */}
      <div className="w-16 flex-none bg-muted/60 border-r border-border flex flex-col items-center justify-between py-4 z-20">
        <div className="flex flex-col items-center space-y-4">
          {/* User Avatar Button (Opens Profile Modal) */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="hover:scale-105 transition-transform focus:outline-none"
            title="Xem hồ sơ cá nhân"
          >
            <UserAvatar fullName={user?.fullName} avatar={user?.avatar} size="md" />
          </button>

          {/* Chat Icon Button */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-primary bg-primary/10 hover:bg-primary/20"
            title="Chat"
            onClick={() => navigate('/chat')}
          >
            <MessageSquare className="w-5 h-5" />
          </Button>

          {/* Friends & Contact Modal Button */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-muted-foreground hover:text-foreground relative"
            title="Danh bạ & Kết bạn"
            onClick={() => setIsFriendsOpen(true)}
          >
            <Users className="w-5 h-5" />
            {receivedRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground font-bold text-[10px] rounded-full flex items-center justify-center animate-pulse">
                {receivedRequests.length}
              </span>
            )}
          </Button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-muted-foreground hover:text-foreground"
            title="Cài đặt hồ sơ"
            onClick={() => setIsProfileOpen(true)}
          >
            <Settings className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-destructive hover:bg-destructive/10"
            title="Đăng xuất"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <Outlet />
      </div>

      {/* 3. Modals & Overlay Windows */}
      <FriendsModal isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <IncomingCallModal onAccept={answerCall} onReject={() => rejectCall('declined')} />
      <CallWindow onEndCall={() => endCall('Cuộc gọi kết thúc')} />
    </div>
  );
};

