import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AccountPage from './pages/AccountPage'
import RequestsPage from './pages/RequestsPage'
import RulesPage from './pages/RulesPage'
import ChatPage from './pages/ChatPage'
import ReviewsPage from './pages/ReviewsPage'
import AdminViolationsPage from './pages/AdminViolationsPage'
import { supabase } from './lib/supabase'
import { safeSupabase } from './lib/asyncData'

const PROFILE_CACHE_PREFIX = 'velinor_profile_cache_'
const PROFILE_LOAD_TIMEOUT_MS = 3500

const PROFILE_SELECT_QUERY = `
  id,
  username,
  role,
  created_at,
  avatar_path,
  avatar_shape,
  hearts_left,
  strikes_count,
  is_blocked,
  blocked_until,
  chat_is_blocked,
  chat_blocked_until,
  payment_is_blocked,
  payment_blocked_until,
  telegram_user_id,
  telegram_username,
  telegram_linked_at
`

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}${userId}`
}

function readCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCachedProfile(userId, nextProfile) {
  try {
    localStorage.setItem(getProfileCacheKey(userId), JSON.stringify(nextProfile))
  } catch {
    // ignore cache write errors
  }
}

function clearCachedProfile(userId) {
  try {
    localStorage.removeItem(getProfileCacheKey(userId))
  } catch {
    // ignore
  }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let isMounted = true
    let subscription = null

    async function bootstrap() {
      if (!supabase) {
        if (isMounted) {
          setAuthLoading(false)
          setProfile(null)
          setUser(null)
        }
        return
      }

      try {
        const {
          data: { session },
        } = await safeSupabase(() => supabase.auth.getSession(), {
          timeoutMs: 2500,
          retries: 0,
          timeoutMessage: 'Не удалось быстро получить сессию',
        })

        if (!isMounted) return

        const nextUser = session?.user ?? null
        setUser(nextUser)

        if (nextUser) {
          const cachedProfile = readCachedProfile(nextUser.id)
          setProfile(cachedProfile ?? null)
          setProfileLoading(!cachedProfile)
        } else {
          setProfile(null)
          setProfileLoading(false)
        }
      } catch (error) {
        console.error(error)

        if (!isMounted) return

        setUser(null)
        setProfile(null)
        setProfileLoading(false)
      } finally {
        if (isMounted) {
          setAuthLoading(false)
        }
      }

      const authListener = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!isMounted) return

        const nextUser = nextSession?.user ?? null
        setUser(nextUser)

        if (nextUser) {
          const cachedProfile = readCachedProfile(nextUser.id)
          setProfile(cachedProfile ?? null)
          setProfileLoading(!cachedProfile)
        } else {
          setProfile(null)
          setProfileLoading(false)
        }

        setAuthLoading(false)
      })

      subscription = authListener?.data?.subscription ?? null
    }

    bootstrap()

    return () => {
      isMounted = false
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadProfile() {
      if (!supabase || !user) {
        if (isMounted) {
          setProfile(null)
          setProfileLoading(false)
        }
        return
      }

      const cachedProfile = readCachedProfile(user.id)

      if (cachedProfile) {
        setProfile(cachedProfile)
        setProfileLoading(false)
      } else {
        setProfileLoading(true)
      }

      try {
        const { data, error } = await safeSupabase(
          () =>
            supabase
              .from('profiles')
              .select(PROFILE_SELECT_QUERY)
              .eq('id', user.id)
              .maybeSingle(),
          {
            timeoutMs: PROFILE_LOAD_TIMEOUT_MS,
            retries: 0,
            timeoutMessage: 'Профиль загружается слишком долго',
          }
        )

        if (!isMounted) return

        if (error && error.code !== 'PGRST116') {
          throw error
        }

        if (data) {
          setProfile(data)
          writeCachedProfile(user.id, data)
        } else if (!cachedProfile) {
          setProfile(null)
          clearCachedProfile(user.id)
        }
      } catch (error) {
        console.error(error)

        if (!isMounted) return

        if (!cachedProfile) {
          setProfile(null)
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [user])

  return (
    <div className="min-h-screen bg-black text-white">
      <Header
        user={user}
        profile={profile}
        authLoading={authLoading}
        profileLoading={profileLoading}
      />

      <Routes>
        <Route path="/" element={<HomePage user={user} profile={profile} />} />

        <Route
          path="/login"
          element={<LoginPage user={user} authLoading={authLoading} />}
        />

        <Route
          path="/register"
          element={<RegisterPage user={user} authLoading={authLoading} />}
        />

        <Route path="/rules" element={<RulesPage />} />

        <Route
          path="/reviews"
          element={<ReviewsPage user={user} profile={profile} />}
        />

        <Route path="/account" element={<Navigate to="/profile" replace />} />

        <Route
          path="/profile"
          element={
            <ProtectedRoute user={user} authLoading={authLoading}>
              <AccountPage
                user={user}
                profile={profile}
                profileLoading={profileLoading}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat"
          element={
            <ProtectedRoute user={user} authLoading={authLoading}>
              <ChatPage user={user} profile={profile} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/requests"
          element={
            <AdminRoute
              user={user}
              profile={profile}
              authLoading={authLoading}
              profileLoading={profileLoading}
            >
              <RequestsPage />
            </AdminRoute>
          }
        />

        <Route
          path="/violations"
          element={
            <AdminRoute
              user={user}
              profile={profile}
              authLoading={authLoading}
              profileLoading={profileLoading}
            >
              <AdminViolationsPage />
            </AdminRoute>
          }
        />
      </Routes>
    </div>
  )
}