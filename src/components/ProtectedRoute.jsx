import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ user, authLoading, children }) {
  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="rounded-2xl border border-fuchsia-500/20 bg-zinc-950/80 px-6 py-4 text-lg text-zinc-300">
          Загружаем аккаунт...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}