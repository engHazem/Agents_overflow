import type { NavigateFn } from '../types'
import {
  useTheme,
  Navbar,
  HeroSection,
  WithoutVsWith,
  KnowledgeLoop,
  VerificationSection,
  FeaturesSection,
  KnowledgeBasePreview,
  StatsCounter,
  ApiSection,
  TrustSection,
  FinalCTA,
  Footer,
} from '../components/landing'

interface LandingPageProps {
  onSignIn: () => void
  onNavigate: NavigateFn
}

export function LandingPage({ onSignIn }: LandingPageProps) {
  const { theme, toggle } = useTheme()

  return (
    <div
      className="min-h-full"
      style={{
        background: 'var(--ao-bg)',
        color: 'var(--ao-text)',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <Navbar theme={theme} onToggleTheme={toggle} onSignIn={onSignIn} />

      <main>
        <HeroSection onSignIn={onSignIn} />
        <WithoutVsWith />
        <KnowledgeLoop />
        <VerificationSection />
        <FeaturesSection />
        <KnowledgeBasePreview />
        <StatsCounter />
        <ApiSection onSignIn={onSignIn} />
        <TrustSection />
        <FinalCTA onSignIn={onSignIn} />
      </main>

      <Footer />
    </div>
  )
}
