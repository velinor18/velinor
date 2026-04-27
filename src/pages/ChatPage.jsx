import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadAvatarAsObjectUrl } from '../lib/avatar'
import { normalizeAvatarShape } from '../lib/avatarShapes'
import { safeSupabase } from '../lib/asyncData'

const INITIAL_MESSAGES_LIMIT = 40
const OLDER_MESSAGES_LIMIT = 60

const MESSAGE_SELECT_QUERY =
  'id, user_id, username, avatar_path, avatar_shape, message_text, created_at'

const PROFILE_SNAPSHOT_SELECT_QUERY = 'id, username, avatar_path, avatar_shape'

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

function isRestrictionActive(isBlocked, blockedUntil) {
  if (!isBlocked) return false
  if (!blockedUntil) return true

  const dateValue = new Date(blockedUntil).getTime()
  if (Number.isNaN(dateValue)) return true

  return dateValue > Date.now()
}

function formatRestrictionUntil(blockedUntil) {
  if (!blockedUntil) return 'срок не указан'

  const dateValue = new Date(blockedUntil)
  if (Number.isNaN(dateValue.getTime())) return 'срок не указан'

  return dateValue.toLocaleString('ru-RU')
}

function MessageAvatar({ username, avatarUrl, avatarShape }) {
  const shapeClass = getAvatarShapeClass(avatarShape)

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-fuchsia-500/20 bg-black text-sm font-black uppercase text-fuchsia-300 sm:h-12 sm:w-12 ${shapeClass}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username}
          className={`h-full w-full object-cover ${shapeClass}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span>{(username || 'U').slice(0, 1)}</span>
      )}
    </div>
  )
}

function ChatMessageItem({ item, isOwn, avatarUrl, profileSnapshot }) {
  const displayUsername = profileSnapshot?.username || item.username
  const displayAvatarShape =
    profileSnapshot?.avatar_shape || item.avatar_shape || 'circle'

  return (
    <div className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {!isOwn ? (
        <MessageAvatar
          username={displayUsername}
          avatarUrl={avatarUrl}
          avatarShape={displayAvatarShape}
        />
      ) : null}

      <div
        className={`max-w-[88%] rounded-[22px] border px-4 py-3 sm:max-w-[76%] ${
          isOwn
            ? 'border-fuchsia-500/25 bg-fuchsia-700/10'
            : 'border-fuchsia-500/10 bg-white/[0.03]'
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="break-all text-sm font-black text-white">
            {displayUsername}
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
          username={displayUsername}
          avatarUrl={avatarUrl}
          avatarShape={displayAvatarShape}
        />
      ) : null}
    </div>
  )
}

export default function ChatPage({ user, profile }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [avatarUrlDirectory, setAvatarUrlDirectory] = useState({})
  const [profilesDirectory, setProfilesDirectory] = useState({})
  const [chatRestriction, setChatRestriction] = useState({
    isBlocked: false,
    blockedUntil: null,
  })

  const bottomRef = useRef(null)
  const chatViewportRef = useRef(null)
  const requestedAvatarPathsRef = useRef(new Set())
  const requestedProfileIdsRef = useRef(new Set())

  useEffect(() => {
    setChatRestriction({
      isBlocked: Boolean(profile?.chat_is_blocked),
      blockedUntil: profile?.chat_blocked_until ?? null,
    })
  }, [profile?.chat_is_blocked, profile?.chat_blocked_until])

  useEffect(() => {
    if (!user?.id || !profile) return

    setProfilesDirectory((prev) => ({
      ...prev,
      [user.id]: {
        id: user.id,
        username: profile.username,
        avatar_path: profile.avatar_path,
        avatar_shape: profile.avatar_shape,
      },
    }))
  }, [
    user?.id,
    profile?.username,
    profile?.avatar_path,
    profile?.avatar_shape,
  ])

  const chatBlocked = isRestrictionActive(
    chatRestriction.isBlocked,
    chatRestriction.blockedUntil
  )

  const loadProfileSnapshotsForMessages = useCallback(
    async (messageItems) => {
      if (!supabase || !messageItems?.length) return

      const uniqueUserIds = [
        ...new Set(
          messageItems
            .map((item) => item.user_id)
            .filter(Boolean)
            .filter((id) => id !== user?.id)
            .filter((id) => !requestedProfileIdsRef.current.has(id))
        ),
      ]

      if (!uniqueUserIds.length) return

      uniqueUserIds.forEach((id) => {
        requestedProfileIdsRef.current.add(id)
      })

      try {
        const { data, error } = await safeSupabase(
          () =>
            supabase
              .from('profiles')
              .select(PROFILE_SNAPSHOT_SELECT_QUERY)
              .in('id', uniqueUserIds),
          {
            timeoutMs: 5000,
            retries: 0,
            timeoutMessage: 'Профили участников чата загружаются слишком долго',
          }
        )

        if (error) {
          throw error
        }

        setProfilesDirectory((prev) => {
          const next = { ...prev }

          ;(data ?? []).forEach((item) => {
            next[item.id] = item
          })

          return next
        })
      } catch (error) {
        console.error(error)

        uniqueUserIds.forEach((id) => {
          requestedProfileIdsRef.current.delete(id)
        })
      }
    },
    [user?.id]
  )

  function getMessageProfileSnapshot(item) {
    if (item.user_id === user?.id) {
      return (
        profilesDirectory[item.user_id] || {
          id: user.id,
          username: profile?.username || item.username,
          avatar_path: profile?.avatar_path || item.avatar_path,
          avatar_shape: profile?.avatar_shape || item.avatar_shape,
        }
      )
    }

    return profilesDirectory[item.user_id] || null
  }

  function getMessageAvatarPath(item) {
    const profileSnapshot = getMessageProfileSnapshot(item)
    return profileSnapshot?.avatar_path || item.avatar_path || ''
  }

  useEffect(() => {
    const uniquePaths = [
      ...new Set(messages.map((item) => getMessageAvatarPath(item)).filter(Boolean)),
    ].filter((path) => !requestedAvatarPathsRef.current.has(path))

    if (!uniquePaths.length) return

    let isMounted = true

    uniquePaths.forEach((path) => {
      requestedAvatarPathsRef.current.add(path)
    })

    Promise.all(
      uniquePaths.map(async (path) => {
        const url = await downloadAvatarAsObjectUrl(path)

        return {
          path,
          url,
        }
      })
    ).then((results) => {
      if (!isMounted) return

      setAvatarUrlDirectory((prev) => {
        const next = { ...prev }

        results.forEach(({ path, url }) => {
          if (url) {
            next[path] = url
          } else {
            requestedAvatarPathsRef.current.delete(path)
          }
        })

        return next
      })
    })

    return () => {
      isMounted = false
    }
  }, [
    messages,
    profilesDirectory,
    profile?.avatar_path,
    profile?.avatar_shape,
    user?.id,
  ])

  useEffect(() => {
    let isMounted = true

    async function loadInitialMessages() {
      if (!supabase || !user) {
        if (isMounted) {
          setMessages([])
          setLoading(false)
        }
        return
      }

      setLoading(true)

      try {
        const { data, error } = await safeSupabase(
          () =>
            supabase
              .from('chat_messages')
              .select(MESSAGE_SELECT_QUERY)
              .order('created_at', { ascending: false })
              .limit(INITIAL_MESSAGES_LIMIT),
          {
            timeoutMs: 6500,
            retries: 0,
            timeoutMessage: 'Чат загружается слишком долго',
          }
        )

        if (!isMounted) return

        if (error) {
          throw error
        }

        const nextMessages = [...(data ?? [])].reverse()
        setMessages(nextMessages)
        setHasOlderMessages((data?.length ?? 0) === INITIAL_MESSAGES_LIMIT)
        setLoading(false)

        loadProfileSnapshotsForMessages(nextMessages)
      } catch (error) {
        console.error(error)

        if (!isMounted) return

        setMessages([])
        setLoading(false)
        setErrorText(error?.message || 'Не удалось загрузить чат')
      }
    }

    loadInitialMessages()

    return () => {
      isMounted = false
    }
  }, [user, loadProfileSnapshotsForMessages])

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

            return [...prev, nextItem]
          })

          loadProfileSnapshotsForMessages([nextItem])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, loadProfileSnapshotsForMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!errorText) return
    const timer = setTimeout(() => setErrorText(''), 3600)
    return () => clearTimeout(timer)
  }, [errorText])

  async function handleLoadOlder() {
    if (!supabase || !user || !messages.length || loadingOlder) {
      return
    }

    setLoadingOlder(true)

    const oldestCreatedAt = messages[0]?.created_at

    try {
      const { data, error } = await safeSupabase(
        () =>
          supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT_QUERY)
            .lt('created_at', oldestCreatedAt)
            .order('created_at', { ascending: false })
            .limit(OLDER_MESSAGES_LIMIT),
        {
          timeoutMs: 6500,
          retries: 0,
          timeoutMessage: 'Старые сообщения загружаются слишком долго',
        }
      )

      setLoadingOlder(false)

      if (error) {
        throw error
      }

      const olderMessages = [...(data ?? [])].reverse()

      setMessages((prev) => [...olderMessages, ...prev])
      setHasOlderMessages((data?.length ?? 0) === OLDER_MESSAGES_LIMIT)
      loadProfileSnapshotsForMessages(olderMessages)

      requestAnimationFrame(() => {
        if (chatViewportRef.current) {
          chatViewportRef.current.scrollTop = 120
        }
      })
    } catch (error) {
      console.error(error)
      setLoadingOlder(false)
      setErrorText(error?.message || 'Не удалось загрузить старые сообщения')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !user) {
      setErrorText('Сначала войдите в аккаунт')
      return
    }

    if (chatBlocked) {
      setErrorText(
        `Вы не можете отправлять сообщения до ${formatRestrictionUntil(
          chatRestriction.blockedUntil
        )}.`
      )
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

    try {
      const { data, error } = await safeSupabase(
        () =>
          supabase.rpc('send_chat_message', {
            p_text: trimmed,
          }),
        {
          timeoutMs: 6000,
          retries: 0,
          timeoutMessage: 'Отправка сообщения заняла слишком много времени',
        }
      )

      setSending(false)

      if (error) {
        throw error
      }

      if (!data?.ok) {
        if (data?.chat_is_blocked || data?.chat_blocked_until) {
          setChatRestriction({
            isBlocked: Boolean(data?.chat_is_blocked),
            blockedUntil: data?.chat_blocked_until ?? null,
          })
        }

        setErrorText(data?.message || 'Сообщение отклонено')
        return
      }

      setMessageText('')
    } catch (error) {
      console.error(error)
      setSending(false)
      setErrorText(error?.message || 'Не удалось отправить сообщение')
    }
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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="rounded-[32px] border border-fuchsia-500/15 bg-zinc-950/80 p-4 shadow-[0_0_60px_rgba(168,85,247,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 border-b border-fuchsia-500/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">Общий чат</h1>
            <div className="mt-2 text-sm text-zinc-500">
              Сообщения отображаются в реальном времени
            </div>
          </div>

          <div className="rounded-2xl border border-fuchsia-500/15 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            Лимит сообщения: 1200 символов
          </div>
        </div>

        <div
          ref={chatViewportRef}
          className="mt-6 h-[52vh] min-h-[420px] overflow-y-auto rounded-[28px] border border-fuchsia-500/10 bg-black/30 p-3 sm:p-5"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-zinc-400">
              Загружаем сообщения...
            </div>
          ) : (
            <div className="space-y-4">
              {hasOlderMessages ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/40 px-5 py-3 text-sm font-bold uppercase tracking-wide text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-900/50 disabled:opacity-60"
                  >
                    {loadingOlder ? 'Загружаем...' : 'Показать более старые'}
                  </button>
                </div>
              ) : null}

              {messages.length === 0 ? (
                <div className="flex h-[320px] flex-col items-center justify-center rounded-[24px] border border-fuchsia-500/10 bg-black/20 px-4 text-center text-zinc-500">
                  <div className="text-2xl font-black text-zinc-300">
                    Чат пока пуст
                  </div>
                  <div className="mt-3 max-w-md text-sm leading-7">
                    После очистки или в новом чате здесь появятся первые сообщения.
                  </div>
                </div>
              ) : (
                messages.map((item) => {
                  const profileSnapshot = getMessageProfileSnapshot(item)
                  const avatarPath = getMessageAvatarPath(item)
                  const avatarUrl = avatarPath
                    ? avatarUrlDirectory[avatarPath] || ''
                    : ''

                  return (
                    <ChatMessageItem
                      key={item.id}
                      item={item}
                      isOwn={item.user_id === user.id}
                      avatarUrl={avatarUrl}
                      profileSnapshot={profileSnapshot}
                    />
                  )
                })
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {chatBlocked ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-200">
            Вы не можете отправлять сообщения, пока чат временно заблокирован.
            <br />
            Срок блокировки до: {formatRestrictionUntil(chatRestriction.blockedUntil)}
          </div>
        ) : null}

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
              disabled={chatBlocked}
              placeholder="Напишите сообщение..."
              className="w-full resize-none rounded-2xl border border-fuchsia-500/15 bg-black/40 px-4 py-4 text-white outline-none transition focus:border-fuchsia-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm leading-6 text-zinc-500">
                Enter отправляет сообщение, Shift + Enter делает перенос строки.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="text-sm text-zinc-500">
                  {messageText.trim().length}/1200
                </div>

                <button
                  type="submit"
                  disabled={sending || chatBlocked}
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