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
import AdminViolationsPage from './pages/AdminViolationsPage'
import { supabase } from './lib/supabase'

const PROFILE_CACHE_PREFIX = 'velinor_profile_cache_'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

    const bootstrap = async () => {
      if (!supabase) {
        if (isMounted) {
          setAuthLoading(false)
        }
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!isMounted) return

      const nextUser = session?.user ?? null
      setUser(nextUser)

      if (nextUser) {
        const cachedProfile = readCachedProfile(nextUser.id)
        if (cachedProfile) {
          setProfile(cachedProfile)
        }
      } else {
        setProfile(null)
      }

      setAuthLoading(false)

      const authListener = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!isMounted) return

        const authUser = nextSession?.user ?? null
        setUser(authUser)

        if (authUser) {
          const cachedProfile = readCachedProfile(authUser.id)
          setProfile(cachedProfile ?? null)
        } else {
          setProfile(null)
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

    const loadProfile = async () => {
      if (!supabase || !user) {
        if (isMounted) {
          if (user?.id) {
            clearCachedProfile(user.id)
          }
          setProfile(null)
          setProfileLoading(false)
        }
        return
      }

      const cachedProfile = readCachedProfile(user.id)

      if (!cachedProfile) {
        setProfileLoading(true)
      } else {
        setProfileLoading(false)
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_QUERY)
          .eq('id', user.id)
          .maybeSingle()

        if (!isMounted) return

        if (data) {
          setProfile(data)
          writeCachedProfile(user.id, data)
          setProfileLoading(false)
          return
        }

        if (error && error.code !== 'PGRST116') {
          console.error(error)
          break
        }

        await sleep(180)
      }

      if (isMounted) {
        setProfileLoading(false)
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [user])

  return (
    <div className="min-h-screen bg-black text-white">
      <Header user={user} profile={profile} authLoading={authLoading} />

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
          path="/admin-violations"
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