'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Reply, Pin, Trash2, Forward, Copy, EyeOff, Pencil } from 'lucide-react';

interface MessageContextMenuProps {
  children: React.ReactNode;
  isOwn: boolean;
  hasText: boolean;
  isPinned: boolean;
  /** Allows deleting other people's messages (dev role) */
  canDelete?: boolean;
  onReply?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  t: (key: string) => string;
}

export function MessageContextMenu({
  children,
  isOwn,
  hasText,
  isPinned,
  canDelete,
  onReply,
  onPin,
  onUnpin,
  onDelete,
  onForward,
  onCopy,
  onEdit,
  t,
}: MessageContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {onReply && (
          <ContextMenuItem onClick={onReply}>
            <Reply className="size-4 mr-2" />
            {t('msg.reply')}
          </ContextMenuItem>
        )}
        {hasText && onCopy && (
          <ContextMenuItem onClick={onCopy}>
            <Copy className="size-4 mr-2" />
            {t('msg.copy')}
          </ContextMenuItem>
        )}
        {onForward && (
          <ContextMenuItem onClick={onForward}>
            <Forward className="size-4 mr-2" />
            {t('msg.forward')}
          </ContextMenuItem>
        )}
        {isOwn && hasText && onEdit && (
          <ContextMenuItem onClick={onEdit}>
            <Pencil className="size-4 mr-2" />
            {t('msg.edit')}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {isPinned ? (
          onUnpin && (
            <ContextMenuItem onClick={onUnpin}>
              <EyeOff className="size-4 mr-2" />
              {t('msg.unpin')}
            </ContextMenuItem>
          )
        ) : (
          onPin && (
            <ContextMenuItem onClick={onPin}>
              <Pin className="size-4 mr-2" />
              {t('msg.pin')}
            </ContextMenuItem>
          )
        )}
        {(isOwn || canDelete) && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="size-4 mr-2" />
              {t('msg.delete')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
