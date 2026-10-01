import { useState } from 'react';
import { X, Users, UserPlus, LogOut, Trash2, Edit2, Check, Shield, Loader2, Upload } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/chatStore';
import { useFriendStore } from '../../../store/friendStore';
import { UserAvatar } from '../../../components/shared/UserAvatar';
import { Input } from '../../../components/ui/input';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import {
  addGroupMembersApi,
  removeGroupMemberApi,
  updateGroupInfoApi,
  uploadFileApi,
  type ConversationItem,
} from '../api';
import { toast } from 'sonner';

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationItem;
}

export const GroupInfoModal = ({ isOpen, onClose, conversation }: GroupInfoModalProps) => {
  const { user } = useAuthStore();
  const { updateConversation, removeConversationFromStore } = useChatStore();
  const { friends } = useFriendStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState(conversation.groupName || '');
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const adminId =
    conversation?.groupAdmin && typeof conversation.groupAdmin === 'object'
      ? conversation.groupAdmin._id
      : conversation?.groupAdmin;

  const isAdmin = user?._id && adminId ? user._id === adminId : false;

  // Filter friends not currently in the group
  const currentMemberIds = (conversation?.members || []).map((m) => m?._id).filter(Boolean);
  const friendsNotInGroup = (friends || []).filter((f) => f && !currentMemberIds.includes(f._id));

  const handleUpdateGroupName = async () => {
    if (!newGroupName.trim()) {
      toast.error('Tên nhóm không được để trống');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await updateGroupInfoApi(conversation._id, {
        groupName: newGroupName.trim(),
      });
      updateConversation(res.data.conversation);
      setIsEditingName(false);
      toast.success('Đã cập nhật tên nhóm thành công!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cập nhật tên nhóm thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedFriendIds.length === 0) return;

    try {
      setIsSubmitting(true);
      const res = await addGroupMembersApi(conversation._id, selectedFriendIds);
      updateConversation(res.data.conversation);
      setSelectedFriendIds([]);
      setIsAddingMembers(false);
      toast.success('Đã thêm thành viên thành công!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thêm thành viên thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [confirmAction, setConfirmAction] = useState<{
    targetUserId: string;
    targetName: string;
    isSelf: boolean;
  } | null>(null);

  const handleRemoveMemberClick = (targetUserId: string, targetName: string) => {
    const isSelf = targetUserId === user?._id;
    setConfirmAction({ targetUserId, targetName, isSelf });
  };

  const handleExecuteRemove = async () => {
    if (!confirmAction) return;
    const { targetUserId, targetName, isSelf } = confirmAction;

    try {
      setIsSubmitting(true);
      const res = await removeGroupMemberApi(conversation._id, targetUserId);

      if (isSelf) {
        removeConversationFromStore(conversation._id);
        toast.success('Bạn đã rời khỏi nhóm');
        onClose();
      } else {
        updateConversation(res.data.conversation);
        toast.success(`Đã xóa ${targetName} khỏi nhóm`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setIsSubmitting(false);
      setConfirmAction(null);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tập tin ảnh hợp lệ (PNG, JPG, WebP...)');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.error('Dung lượng ảnh tối đa 25MB');
      return;
    }

    const toastId = toast.loading('Đang tải ảnh nhóm mới...');
    try {
      setIsSubmitting(true);
      const uploadRes = await uploadFileApi(file);
      const res = await updateGroupInfoApi(conversation._id, {
        groupAvatar: uploadRes.data.url,
      });
      updateConversation(res.data.conversation);
      toast.success('Đã cập nhật ảnh đại diện nhóm!', { id: toastId });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cập nhật ảnh nhóm thất bại', { id: toastId });
    } finally {
      setIsSubmitting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 font-bold text-base text-foreground">
            <Users className="w-5 h-5 text-primary" />
            <span>Thông tin nhóm</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 divide-y divide-border/40">
          {/* Group Profile Header */}
          <div className="flex flex-col items-center text-center space-y-3 pt-2">
            <div className="relative group">
              {conversation.groupAvatar ? (
                <img
                  src={conversation.groupAvatar}
                  alt={conversation.groupName || 'Nhóm'}
                  className="w-20 h-20 rounded-full object-cover border-2 border-primary/20 shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl shadow-inner border-2 border-primary/20">
                  <Users className="w-10 h-10" />
                </div>
              )}

              {isAdmin && (
                <label
                  htmlFor="group-avatar-upload"
                  className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                  title="Đổi ảnh đại diện nhóm"
                >
                  <Upload className="w-6 h-6" />
                  <input
                    id="group-avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {isAdmin && (
              <label
                htmlFor="group-avatar-upload"
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải ảnh nhóm từ thiết bị</span>
              </label>
            )}

            {/* Editable Group Name */}
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <Input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="bg-muted/40 text-center text-sm font-bold"
                  autoFocus
                />
                <button
                  onClick={handleUpdateGroupName}
                  disabled={isSubmitting}
                  className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 group">
                <h3 className="text-lg font-bold text-foreground">
                  {conversation.groupName || 'Nhóm trò chuyện'}
                </h3>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setNewGroupName(conversation.groupName || '');
                      setIsEditingName(true);
                    }}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors opacity-80"
                    title="Đổi tên nhóm"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {conversation.members.length} thành viên
            </p>
          </div>

          {/* Members Section */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Thành viên nhóm ({conversation.members.length})
              </h4>
              {isAdmin && !isAddingMembers && (
                <button
                  onClick={() => setIsAddingMembers(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Thêm người</span>
                </button>
              )}
            </div>

            {/* Inline Add Members UI */}
            {isAddingMembers && (
              <div className="p-3 bg-muted/30 rounded-xl border border-border/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Chọn bạn bè để thêm
                  </span>
                  <button
                    onClick={() => {
                      setIsAddingMembers(false);
                      setSelectedFriendIds([]);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Đóng
                  </button>
                </div>

                {friendsNotInGroup.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Tất cả bạn bè của bạn đều đã có trong nhóm này.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {friendsNotInGroup.map((friend) => {
                      const isSelected = selectedFriendIds.includes(friend._id);
                      return (
                        <div
                          key={friend._id}
                          onClick={() => {
                            setSelectedFriendIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== friend._id)
                                : [...prev, friend._id]
                            );
                          }}
                          className={`p-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-xs ${
                            isSelected
                              ? 'bg-primary/10 border border-primary/30'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              fullName={friend.fullName}
                              avatar={friend.avatar}
                              size="sm"
                            />
                            <span className="font-semibold text-foreground">
                              {friend.fullName}
                            </span>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                              isSelected
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {friendsNotInGroup.length > 0 && (
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={handleAddMembers}
                      disabled={selectedFriendIds.length === 0 || isSubmitting}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        `Thêm (${selectedFriendIds.length})`
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Member List */}
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {conversation.members.map((member) => {
                const isMemberAdmin = member._id === adminId;
                const isCurrentUser = member._id === user?._id;

                return (
                  <div
                    key={member._id}
                    className="p-2.5 rounded-xl flex items-center justify-between hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        fullName={member.fullName}
                        avatar={member.avatar}
                        isOnline={member.isOnline}
                        showStatus
                        size="md"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {member.fullName}
                          </span>
                          {isCurrentUser && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              (Bạn)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          @{member.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isMemberAdmin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                          <Shield className="w-3 h-3" />
                          Trưởng nhóm
                        </span>
                      )}

                      {isAdmin && !isCurrentUser && (
                        <button
                          onClick={() =>
                            handleRemoveMemberClick(member._id, member.fullName)
                          }
                          disabled={isSubmitting}
                          className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                          title="Xóa khỏi nhóm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leave Group Action */}
          <div className="pt-4 flex items-center justify-center">
            <button
              onClick={() => handleRemoveMemberClick(user?._id || '', user?.fullName || '')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Rời khỏi nhóm</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleExecuteRemove}
        title={confirmAction?.isSelf ? 'Rời khỏi nhóm' : 'Xóa thành viên'}
        description={
          confirmAction?.isSelf
            ? 'Bạn có chắc chắn muốn rời khỏi nhóm này không?'
            : `Bạn có chắc chắn muốn xóa "${confirmAction?.targetName}" khỏi nhóm này không?`
        }
        confirmText={confirmAction?.isSelf ? 'Rời nhóm' : 'Xóa thành viên'}
        cancelText="Hủy"
        variant="destructive"
        isLoading={isSubmitting}
      />
    </div>
  );
};
