import { lazy, Suspense } from 'react'

import { createBrowserRouter, Navigate } from 'react-router-dom'

import LoginPage from './pages/Login'
import ProjectsPage from './pages/Projects'
import RegisterPage from './pages/Register'

const EditorPage = lazy(() => import('./pages/Editor'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/editor" replace />,
  },
  {
    path: '/editor',
    element: (
      <Suspense fallback={<div>Loading editor...</div>}>
        <EditorPage />
      </Suspense>
    ),
  },
  {
    path: '/projects',
    element: <ProjectsPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '*',
    element: <div>404 Not Found</div>,
  },
])

export default router
