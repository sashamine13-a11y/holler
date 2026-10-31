'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageContextMenu } from '@/components/message-context-menu';
import { avColor, initials, formatTime, safeDataUrl, MAX_MSG_LEN, type Message, type Poll, type AnonQuestion } from '@/lib/chat-types';
import { useLocalSettings, formatTimePref } from '@/lib/local-settings';
import type { ChannelComment } from '@/lib/api';
import {
  BarChart3, CheckCircle2, ChevronDown, Circle, EyeOff, Forward, MessageCircle,
  MessageCircleOff, Pin, Reply, Send, Trash2, Wrench,
} from 'lucide-react';

// ============================================================================
// MessageItem — gradient bubbles, hover-reply, audio/video, in-bubble meta
// ============================================================================

export function MessageItem(props: {
  msg: Message;
  currentUserId: string;
  showHeader: boolean;
  isPinned: boolean;
  isEditing: boolean;
  editText: string;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onReply?: (msg: Message) => void;
  onPin?: (msg: Message) => void;
  onUnpin?: () => void;
  onDelete?: (msg: Message) => void;
  onForward?: (msg: Message) => void;
  onCopy?: (text: string) => void;
  onEdit?: (msg: Message) => void;
  onAuthorClick?: (authorId: string) => void;
  t: (key: string) => string;
  // dev role: can delete any message
  canModerate?: boolean;
  // channel comments thread under the post
  channelMode?: boolean;
  comments?: ChannelComment[];
  commentsAllowed?: boolean;
  canModerateComments?: boolean;
  onAddComment?: (msgId: string, text: string) => void;
  onDeleteComment?: (c: ChannelComment) => void;
}) {
  const {
    msg, currentUserId, showHeader, isPinned, isEditing, editText,
    onEditChange, onEditSave, onEditCancel,
    onReply, onPin, onUnpin, onDelete, onForward, onCopy, onEdit, onAuthorClick, t,
    canModerate, channelMode, comments, commentsAllowed, canModerateComments,
    onAddComment, onDeleteComment,
  } = props;
  const { settings } = useLocalSettings();
  const mine = msg.authorId === currentUserId;
  const isVideo = msg.mediaType === 'video';
  const isAudio = msg.mediaType === 'audio';
  const safeImage = safeDataUrl(msg.image);

  const onReplyCb = onReply ? () => onReply(msg) : undefined;
  const onForwardCb = onForward ? () => onForward(msg) : undefined;
  const onDeleteCb = onDelete ? () => onDelete(msg) : undefined;
  const onEditCb = (onEdit && mine && msg.text) ? () => onEdit(msg) : undefined;
  const onCopyCb = (onCopy && msg.text) ? () => onCopy(msg.text) : undefined;
  const onPinCb = onPin ? () => onPin(msg) : undefined;

  return (
    <MessageContextMenu
      isOwn={mine} hasText={Boolean(msg.text)} isPinned={isPinned}
      canDelete={canModerate}
      onReply={onReplyCb} onPin={onPinCb} onUnpin={onUnpin}
      onDelete={onDeleteCb} onForward={onForwardCb} onCopy={onCopyCb} onEdit={onEditCb} t={t}
    >
      <div className={`group/msg flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
        {/* Avatar column */}
        <div className="w-8 shrink-0 flex justify-center pt-1">
          {showHeader ? (
            onAuthorClick && !msg.anon && !mine ? (
              <button
                type="button"
                onClick={() => onAuthorClick(msg.authorId)}
                className="rounded-full flex items-center justify-center font-bold text-white size-8 avatar-pop hover:opacity-80 transition-opacity"
                style={{ background: avColor(msg.authorId), fontSize: 12 }}
                aria-label={msg.authorName}
              >
                {initials(msg.authorName)}
              </button>
            ) : (
              <div
                className={`rounded-full flex items-center justify-center font-bold text-white size-8 avatar-pop ${mine ? 'brand-mark' : ''}`}
                style={mine ? { fontSize: 12 } : { background: msg.anon ? '#7c5cd6' : avColor(msg.authorId), fontSize: 12 }}
              >
                {msg.anon ? <EyeOff className="size-3.5" /> : initials(msg.authorName)}
              </div>
            )
          ) : null}
        </div>
        <div className={`max-w-[78%] sm:max-w-[68%] ${mine ? 'items-end' : 'items-start'} flex flex-col min-w-0`}>
          {showHeader && (
            <div className={`flex items-center gap-2 text-xs mb-1 px-1 max-w-full ${mine ? 'flex-row-reverse' : ''}`}>
              {onAuthorClick && !msg.anon && !mine ? (
                <button
                  type="button"
                  onClick={() => onAuthorClick(msg.authorId)}
                  className="font-semibold text-foreground hover:underline truncate"
                >
                  {msg.authorName}
                </button>
              ) : (
                <span className={msg.anon ? 'text-violet-400 font-semibold' : 'font-semibold text-foreground'}>
                  {msg.anon ? t('msg.anonymous') : msg.authorName}
                </span>
              )}
              {!msg.anon && msg.role === 'admin' && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 tracking-wide shrink-0">ADMIN</Badge>
              )}
              {!msg.anon && msg.role === 'dev' && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 tracking-wide shrink-0 gap-0.5 border-cyan-500/40 bg-cyan-500/10 text-cyan-600">
                  <Wrench className="size-2.5" /> {t('room.devTag')}
                </Badge>
              )}
              {isPinned && (
                <span className="inline-flex items-center gap-0.5 text-amber-500 text-[10px] font-medium shrink-0">
                  <Pin className="size-2.5" /> {t('msg.pinned')}
                </span>
              )}
            </div>
          )}
          <div className={`relative flex items-end gap-1.5 max-w-full ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
            <div
              className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed max-w-full
                ${mine ? 'bubble-own ' + (showHeader ? 'rounded-tr-md' : '')
                        : 'bubble-other ' + (showHeader ? 'rounded-tl-md' : '')}`}
            >
              {/* Reply quote */}
              {msg.replyTo && (
                <div className={`mb-1.5 px-2 py-1 rounded-md text-xs border-l-2 max-w-full ${
                  mine ? 'bg-white/15 border-white/70' : 'bg-muted/60 border-primary'
                }`}>
                  <div className={`font-medium text-[10px] uppercase tracking-wide ${mine ? 'text-white/85' : 'text-primary'}`}>
                    {t('msg.reply')}
                  </div>
                  <div className={`truncate ${mine ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {msg.replySnippet ?? 'Original message'}
                  </div>
                </div>
              )}
              {/* Forward quote */}
              {msg.forwardedFrom && (
                <div className={`mb-1.5 px-2 py-1 rounded-md text-xs border-l-2 ${
                  mine ? 'bg-white/15 border-amber-300/80' : 'bg-muted/60 border-amber-500'
                }`}>
                  <div className={`font-medium text-[10px] uppercase tracking-wide flex items-center gap-1 ${mine ? 'text-white/85' : 'text-amber-500'}`}>
                    <Forward className="size-2.5 shrink-0" /> {t('msg.forwardedFrom')}
                  </div>
                  <div className={`text-[10px] truncate ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {msg.forwardedFrom}
                  </div>
                </div>
              )}
              {isEditing ? (
                <div className="flex flex-col gap-1.5 min-w-[220px] max-w-full">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => onEditChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onEditSave();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onEditCancel();
                      }
                    }}
                    className={`w-full resize-none min-h-[60px] max-h-40 rounded-lg p-2 text-sm outline-none word-safe
                      ${mine
                        ? 'bg-white/10 text-white placeholder:text-white/60 border border-white/30'
                        : 'bg-background text-foreground border border-border'}`}
                    maxLength={MAX_MSG_LEN}
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEditCancel}>
                      {t('cancel')}
                    </Button>
                    <Button size="sm" className="h-7 px-3 text-xs" onClick={onEditSave} disabled={!editText.trim()}>
                      {t('save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {msg.text && <p className="whitespace-pre-wrap word-safe">{msg.text}</p>}
                  {safeImage && isAudio ? (
                    <audio src={safeImage} controls className="w-[230px] max-w-full mt-1.5" preload="metadata" />
                  ) : safeImage && isVideo ? (
                    <video src={safeImage} controls className="rounded-xl max-w-full max-h-80 mt-1.5" preload="metadata" />
                  ) : safeImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImage}
                      alt="attachment"
                      className="rounded-xl max-w-full max-h-80 mt-1.5 cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      onClick={() => window.open(safeImage, '_blank')}
                    />
                  ) : null}
                  {/* Meta: time / edited — inside the bubble */}
                  <div className={`flex items-center justify-end gap-1.5 text-[10px] mt-0.5 ${mine ? 'text-white/65' : 'text-muted-foreground/80'}`}>
                    {msg.editedAt && <span className="italic">{t('msg.edited')}</span>}
                    <span className="tabular-nums">{formatTimePref(msg.ts, settings)}</span>
                  </div>
                </>
              )}
            </div>
            {/* Quick reply on hover */}
            {onReplyCb && !isEditing && (
              <button
                type="button"
                onClick={onReplyCb}
                aria-label={t('msg.reply')}
                className="opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 transition-opacity
                  size-7 rounded-full glass border border-border flex items-center justify-center
                  text-muted-foreground hover:text-primary shrink-0 mb-1"
              >
                <Reply className="size-3.5" />
              </button>
            )}
          </div>
          {/* Channel post comments thread */}
          {channelMode && comments && onAddComment && onDeleteComment && (
            <CommentThread
              msgId={msg.id}
              comments={comments}
              allowed={!!commentsAllowed}
              canModerate={!!canModerateComments}
              currentUserId={currentUserId}
              onAdd={(text) => onAddComment(msg.id, text)}
              onDelete={onDeleteComment}
              t={t}
            />
          )}
        </div>
      </div>
    </MessageContextMenu>
  );
}

// ============================================================================
// CommentThread — discussion under a channel post
// ============================================================================

function CommentThread(props: {
  msgId: string;
  comments: ChannelComment[];
  allowed: boolean;
  canModerate: boolean;
  currentUserId: string;
  onAdd: (text: string) => void;
  onDelete: (c: ChannelComment) => void;
  t: (key: string) => string;
}) {
  const { settings } = useLocalSettings();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const count = props.comments.length;

  return (
    <div className="mt-1 w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-full hover:bg-muted/50"
      >
        <MessageCircle className="size-3.5" />
        <span className="tabular-nums font-medium">{count}</span>
        <span>{props.t('cmt.title')}</span>
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-border bg-muted/20 p-2 space-y-1.5 slide-down">
          {count === 0 && (
            <div className="text-xs text-muted-foreground px-1 py-0.5">{props.t('cmt.empty')}</div>
          )}
          {props.comments.map(c => {
            const mine = c.author_id === props.currentUserId;
            const canDel = mine || props.canModerate;
            return (
              <div key={c.id} className="group/c flex items-start gap-2 px-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-foreground truncate">{c.author_name}</span>
                    <span className="text-muted-foreground/70 tabular-nums shrink-0">
                      {formatTimePref(new Date(c.created_at).getTime(), settings)}
                    </span>
                  </div>
                  <div className="text-[13px] whitespace-pre-wrap word-safe break-words text-foreground/90">{c.text}</div>
                </div>
                {canDel && (
                  <button
                    type="button"
                    aria-label={props.t('msg.delete')}
                    className="opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                    onClick={() => props.onDelete(c)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {props.allowed ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim()) { props.onAdd(text); setText(''); }
                  }
                }}
                placeholder={props.t('cmt.placeholder')}
                maxLength={MAX_MSG_LEN}
                className="h-8 text-[13px] rounded-lg bg-background/60"
              />
              <Button
                size="icon"
                className="size-8 rounded-lg shrink-0"
                disabled={!text.trim()}
                onClick={() => { props.onAdd(text); setText(''); }}
                aria-label={props.t('msg.send')}
              >
                <Send className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground px-1 py-1 flex items-center gap-1.5">
              <MessageCircleOff className="size-3.5 shrink-0" /> {props.t('cmt.disabled')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PollCard — progress bars
// ============================================================================

export function PollCard(props: { poll: Poll; currentUserId: string; onVote: (pollId: string, optIdx: number) => void; t: (key: string) => string }) {
  const { poll, currentUserId, onVote, t } = props;
  const { settings } = useLocalSettings();
  const voted = poll.options.some(o => o.votes.includes(currentUserId));
  const myVote = poll.options.findIndex(o => o.votes.includes(currentUserId));
  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);

  return (
    <Card className="p-4 msg-in card-slide-in border-primary/25 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{t('poll.title')}</span>
      </div>
      <div className="font-semibold mb-3 word-safe">{poll.q}</div>
      <div className="flex flex-col gap-2">
        {poll.options.map((o, i) => {
          const c = o.votes.length;
          const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0;
          const isMyVote = myVote === i;
          if (voted) {
            return (
              <div
                key={i}
                className={`relative rounded-xl overflow-hidden border p-2.5 transition-colors
                  ${isMyVote ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-all bar-fill
                    ${isMyVote ? 'bg-primary/20' : 'bg-muted/50'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between text-sm gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMyVote ? (
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={`word-safe ${isMyVote ? 'font-medium' : ''}`}>{o.t}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums text-xs shrink-0">
                    {pct}% · {c}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <button
              key={i}
              className="text-left text-sm border border-border rounded-xl px-3 py-2.5 hover:border-primary hover:bg-muted/40 transition-colors flex items-center gap-2"
              onClick={() => onVote(poll.id, i)}
            >
              <Circle className="size-4 text-muted-foreground shrink-0" />
              <span className="flex-1 word-safe">{o.t}</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-3 flex items-center justify-between">
        <span>{totalVotes} {t('poll.votes')}</span>
        <span className="tabular-nums">{formatTimePref(poll.ts, settings)}</span>
      </div>
    </Card>
  );
}

// ============================================================================
// AnonCard
// ============================================================================

export function AnonCard(props: { q: AnonQuestion; onAnswer: (id: string, text: string) => void; t: (key: string) => string }) {
  const { q, onAnswer, t } = props;
  const [text, setText] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <Card className="p-4 msg-in card-slide-in border-violet-500/25 bg-violet-500/5">
      <div className="flex items-center gap-2 mb-1">
        <EyeOff className="size-4 text-violet-400 shrink-0" />
        <span className="text-xs uppercase tracking-wide text-violet-400 font-medium">{t('anon.title')}</span>
      </div>
      <div className="font-medium mb-3 word-safe">{q.q}</div>
      {showAnswer ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('anon.yourAnswer')}
            rows={2}
            maxLength={500}
            className="resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onAnswer(q.id, text);
                setText('');
                setShowAnswer(false);
              }}
              disabled={!text.trim()}
            >
              <Send className="size-3 mr-1" /> {t('anon.reply')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAnswer(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowAnswer(true)}>
          <EyeOff className="size-3 mr-1" /> {t('anon.replyAnon')}
        </Button>
      )}
    </Card>
  );
}
