import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { PanelPage } from './pages/PanelPage'
import { SourcePage } from './pages/SourcePage'
import { ThemeEditPage } from './pages/ThemeEditPage'

function App() {
  const location = useLocation()
  const isPanelRoute = location.pathname === '/panel'
  const isSourceRoute = location.pathname.startsWith('/source/')
  const isThemeRoute = location.pathname.startsWith('/themes/')

  useEffect(() => {
    document.documentElement.classList.toggle('source-mode', isSourceRoute)
    document.body.classList.toggle('source-mode', isSourceRoute)
    return () => {
      document.documentElement.classList.remove('source-mode')
      document.body.classList.remove('source-mode')
    }
  }, [isSourceRoute])

  return (
    <div className={isSourceRoute ? 'app-shell app-shell-source' : 'app-shell'}>
      <main
        className={
          isSourceRoute
            ? 'content content-source'
            : isPanelRoute
              ? 'content content-panel'
              : isThemeRoute
                ? 'content content-theme'
                : 'content'
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/themes/new" element={<ThemeEditPage />} />
          <Route path="/themes/:id" element={<ThemeEditPage />} />
          <Route path="/panel" element={<PanelPage />} />
          <Route path="/source/:id" element={<SourcePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
