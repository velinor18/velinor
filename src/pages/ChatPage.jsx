import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadAvatarAsObjectUrl, revokeObjectUrl } from '../lib/avatar'
import { normalizeAvatarShape } from '../lib/avatarShapes'

function getAvatarShapeClass(shape) {
  const normalized = normalizeAvatarShape(shape)

  if (normalized === 'circle') return 'rounded-full'
  if (normalized === 'rounded') return 'rounded-[28%]'
  if (normalized === 'square') return 'rounded-[18px]'
  if (normalized === 'diamond') {
    return '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]'
  }
  if (normalized === 'hexagon') {
    return '[clip-path:polygon(25%_6.7%,75%_6.7%,100%_50%,75%_93.3%,25%_93.3%,0%_50%)]'
  }
  if (normalized === 'triangle') {
    return '[clip-path:polygon(50%_0%,0%_100%,100%_100%)]'
  }

  return 'rounded-full'
}

function formatMessageTime(value) {
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function MessageAvatar({ username, avatarPath, avatarShape }) {
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    let isMounted = true
    let currentUrl = ''

    async function loadAvatar() {
      if (!avatarPath) {
        if (isMounted) {
          setAvatarUrl('')
        }
        return
      }

      const nextUrl = await downloadAvatarAsObjectUrl(avatarPath)

      if (!isMounted) {
        revokeObjectUrl(nextUrl)
        return
      }

      currentUrl = nextUrl || ''
      setAvatarUrl(currentUrl)
    }

    loadAvatar()

    return () => {
      isMounted = false
      if (currentUrl) {
        revokeObjectUrl(currentUrl)
      }
    }
  }, [avatarPath])

  const shapeClass = getAvatarShapeClass(avatarShape)

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-fuchsia-500/20 bg-black text-sm font-black uppercase text-fuchsia-300 ${shapeClass}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username}
          className={`h-full w-full object-cover ${shapeClass}`}
        />
      ) : (
        <span>{(username || 'U').slice(0, 1)}</span>
      )}
    </div>
  )
}

function ChatMessageItem({ item, isOwn }) {
  return (
    <div className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {!isOwn ? (
        <MessageAvatar
          username={item.username}
          avatarPath={item.avatar_path}
          avatarShape={item.avatar_shape}
        />
      ) : null}

      <div
        className={`max-w-[85%] rounded-[24px] border px-4 py-3 sm:max-w-[75%] ${
          isOwn
            ? 'border-fuchsia-500/25 bg-fuchsia-700/10'
            : 'border-fuchsia-500/10 bg-white/[0.03]'
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="break-all text-sm font-black text-white">
            {item.username}
          </div>
          <div className="text-xs text-zinc-500">
            {formatMessageTime(item.created_at)}
          </div>
        </div>

        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200 sm:text-base">
          {item.message_text}
        </div>
      </div>

      {isOwn ? (
        <MessageAvatar
          username={item.username}
          avatarPath={item.avatar_path}
          avatarShape={item.avatar_shape}
        />
      ) : null}
    </div>
  )
}

export default function ChatPage({ user, profile }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorText, setErrorText] = useState('')

  const bottomRef = useRef(null)

  const senderUsername = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.email) return user.email.split('@')[0]
    return 'user'
  }, [profile?.username, user?.email])

  const senderAvatarPath = profile?.avatar_path ?? null
  const senderAvatarShape = profile?.avatar_shape ?? 'circle'

  useEffect(() => {
    let isMounted = true

    async function loadMessages() {
      if (!supabase || !user) {
        if (isMounted) {
          setMessages([])
          setLoading(false)
        }
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          'id, user_id, username, avatar_path, avatar_shape, message_text, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(100)

      if (!isMounted) return

      if (error) {
        console.error(error)
        setMessages([])
        setLoading(false)
        return
      }

      setMessages([...(data ?? [])].reverse())
      setLoading(false)
    }

    loadMessages()

    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (!supabase || !user) return

    const channel = supabase
      .channel('public-chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const nextItem = payload.new

          setMessages((prev) => {
            if (prev.some((item) => item.id === nextItem.id)) {
              return prev
            }

            const next = [...prev, nextItem]
            return next.length > 100 ? next.slice(next.length - 100) : next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!errorText) return
    const timer = setTimeout(() => setErrorText(''), 2600)
    return () => clearTimeout(timer)
  }, [errorText])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !user) {
      setErrorText('Сначала войдите в аккаунт')
      return
    }

    const trimmed = messageText.trim()

    if (!trimmed) {
      setErrorText('Введите сообщение')
      return
    }

    if (trimmed.length > 1200) {
      setErrorText('Сообщение слишком длинное')
      return
    }

    setSending(true)

    const { error } = await supabase.from('chat_messages').insert({
      user_id: user.id,
      username: senderUsername,
      avatar_path: senderAvatarPath,
      avatar_shape: senderAvatarShape,
      message_text: trimmed,
    })

    setSending(false)

    if (error) {
      console.error(error)
      setErrorText('Не удалось отправить сообщение')
      return
    }

    setMessageText('')
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-8 text-center shadow-[0_0_60px_rgba(168,85,247,0.08)]">
          <h1 className="text-4xl font-black">Чат</h1>
          <p className="mt-4 text-zinc-400">
            Чтобы открыть общий чат, сначала войдите в аккаунт.
          </p>

          <div className="mt-8">
            <NavLink
              to="/login"
              className="inline-flex rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01]"
            >
              Перейти ко входу
            </NavLink>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-4 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-fuchsia-500/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-black">Общий чат</h1>
            <div className="mt-2 text-sm text-zinc-400">
              Сообщения появляются в реальном времени.
            </div>
          </div>

          <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            Вы вошли как <span className="font-bold text-white">{senderUsername}</span>
          </div>
        </div>

        <div className="mt-6 h-[52vh] min-h-[420px] overflow-y-auto rounded-[28px] border border-fuchsia-500/10 bg-black/30 p-4 sm:p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-zinc-400">
              Загружаем сообщения...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-zinc-500">
              Пока сообщений нет. Напишите первым.
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((item) => (
                <ChatMessageItem
                  key={item.id}
                  item={item}
                  isOwn={item.user_id === user.id}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          <div className="rounded-[28px] border border-fuchsia-500/10 bg-black/30 p-4">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmit(event)
                }
              }}
              rows={4}
              maxLength={1200}
              placeholder="Напишите сообщение..."
              className="w-full resize-none rounded-2xl border border-fuchsia-500/15 bg-black/40 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/40"
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-500">
                Enter отправляет сообщение. Shift + Enter делает перенос строки.
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-zinc-500">
                  {messageText.trim().length}/1200
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_40px_rgba(168,85,247,0.28)] transition hover:scale-[1.01] disabled:opacity-60"
                >
                  {sending ? 'Отправляем...' : 'Отправить'}
                </button>
              </div>
            </div>

            {errorText ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorText}
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}