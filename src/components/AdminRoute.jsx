import { Navigate } from 'react-router-dom'

export default function AdminRoute({
  user,
  profile,
  authLoading,
  profileLoading,
  children,
}) {
  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="rounded-2xl border border-fuchsia-500/20 bg-zinc-950/80 px-6 py-4 text-lg text-zinc-300">
          Загружаем доступ...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/account" replace />
  }

  return children
}