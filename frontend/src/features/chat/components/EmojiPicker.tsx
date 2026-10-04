import React, { useEffect, useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, isOpen, onClose }) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (pickerRef.current && !pickerRef.current.contains(target) && !target.closest('.emoji-toggle-btn')) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-16 right-12 z-50 shadow-2xl rounded-2xl overflow-hidden border border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <Picker
        data={data}
        onEmojiSelect={(emoji: any) => {
          if (emoji?.native) {
            onSelectEmoji(emoji.native);
          }
        }}
        theme={isDark ? 'dark' : 'light'}
        locale="vi"
        previewPosition="none"
        skinTonePosition="none"
        searchPosition="top"
        navPosition="top"
        perLine={8}
        maxFrequentRows={1}
      />
    </div>
  );
};
