import React from 'react';
import { cn } from '../../lib/utils';

interface UserAvatarProps {
  fullName?: string;
  avatar?: string;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
};

const badgeClasses = {
  sm: 'w-2.5 h-2.5 right-0 bottom-0',
  md: 'w-3 h-3 right-0 bottom-0 border-2',
  lg: 'w-3.5 h-3.5 right-0.5 bottom-0.5 border-2',
  xl: 'w-5 h-5 right-1 bottom-1 border-2',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  fullName = 'User',
  avatar,
  isOnline,
  size = 'md',
  showStatus = false,
  className,
}) => {
  const getInitial = (name: string) => {
    if (!name || !name.trim()) return 'U';
    const parts = name.trim().split(/\s+/);
    const lastWord = parts[parts.length - 1];
    return lastWord ? lastWord.charAt(0).toUpperCase() : 'U';
  };

  return (
    <div
      className={cn(
        'relative inline-flex flex-shrink-0 items-center justify-center',
        sizeClasses[size],
        className
      )}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={fullName}
          className="w-full h-full rounded-full object-cover border border-border/50"
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center border border-primary/20 select-none"
        >
          {getInitial(fullName)}
        </div>
      )}

      {showStatus && (
        <span
          className={cn(
            'absolute rounded-full border-background transition-colors',
            badgeClasses[size],
            isOnline ? 'bg-success' : 'bg-muted-foreground/40'
          )}
          title={isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
        />
      )}
    </div>
  );
};
