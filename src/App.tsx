import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AppShell } from './components/AppShell'
import { ScrollToTop } from './components/ScrollToTop'
import { Spinner } from './components/ui'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CompaniesPage from './pages/CompaniesPage'
import CompanyTrashPage from './pages/CompanyTrashPage'
import MeetingsPage from './pages/MeetingsPage'
import CompanyNewPage from './pages/CompanyNewPage'
import IntakeStartPage from './pages/IntakeStartPage'
import CompanyPage from './pages/CompanyPage'
import CompanyToolsPage from './pages/CompanyToolsPage'
import MeetingLivePage from './pages/MeetingLivePage'
import MeetingResultPage from './pages/MeetingResultPage'
import CasesPage from './pages/CasesPage'
import CaseDetailPage from './pages/CaseDetailPage'
import PlaybookPage from './pages/PlaybookPage'
import MorePage from './pages/MorePage'
import SettingsPage from './pages/SettingsPage'
import HandoffPage from './pages/HandoffPage'

// 인쇄 리포트·마스터 화면은 자주 쓰지 않으므로 분리 청크
const MeetingReportPage = lazy(() => import('./pages/MeetingReportPage'))
// PDF 읽기(pdf.js)는 무거워서 필요할 때만
const PdfIntakePage = lazy(() => import('./pages/PdfIntakePage'))
const MasterInboxPage = lazy(() => import('./pages/MasterInboxPage'))
const MasterPartnersPage = lazy(() => import('./pages/MasterPartnersPage'))
const MasterPartnerProfilePage = lazy(() => import('./pages/MasterPartnerProfilePage'))
const MasterAuditPage = lazy(() => import('./pages/MasterAuditPage'))
const MasterUsagePage = lazy(() => import('./pages/MasterUsagePage'))

function Guard({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Spinner />
  if (status === 'ready') return <>{children}</>
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
}

function MasterOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'master') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <AppRoutes />
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/meetings/:meetingId/report"
        element={
          <Guard>
            <Suspense fallback={<Spinner />}>
              <MeetingReportPage />
            </Suspense>
          </Guard>
        }
      />
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/new" element={<IntakeStartPage />} />
        <Route path="companies/new/quick" element={<CompanyNewPage />} />
        <Route
          path="companies/new/pdf"
          element={
            <Suspense fallback={<Spinner />}>
              <PdfIntakePage />
            </Suspense>
          }
        />
        <Route path="companies/trash" element={<CompanyTrashPage />} />
        <Route path="companies/:companyId" element={<CompanyPage />} />
        <Route path="companies/:companyId/edit" element={<CompanyNewPage />} />
        <Route path="companies/:companyId/tools" element={<CompanyToolsPage />} />
        <Route
          path="companies/:companyId/pdf"
          element={
            <Suspense fallback={<Spinner />}>
              <PdfIntakePage />
            </Suspense>
          }
        />
        <Route path="meetings/:meetingId/live" element={<MeetingLivePage />} />
        <Route path="meetings/:meetingId/result" element={<MeetingResultPage />} />
        <Route path="handoffs/:handoffId" element={<HandoffPage />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/:caseId" element={<CaseDetailPage />} />
        <Route path="playbook" element={<PlaybookPage />} />
        <Route path="objections" element={<Navigate to="/playbook?tab=objections" replace />} />
        <Route path="forbidden" element={<Navigate to="/playbook?tab=forbidden" replace />} />
        <Route path="more" element={<MorePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="master/inbox"
          element={
            <MasterOnly>
              <Suspense fallback={<Spinner />}>
                <MasterInboxPage />
              </Suspense>
            </MasterOnly>
          }
        />
        <Route
          path="master/partners"
          element={
            <MasterOnly>
              <Suspense fallback={<Spinner />}>
                <MasterPartnersPage />
              </Suspense>
            </MasterOnly>
          }
        />
        <Route
          path="master/partners/:profileId"
          element={
            <MasterOnly>
              <Suspense fallback={<Spinner />}>
                <MasterPartnerProfilePage />
              </Suspense>
            </MasterOnly>
          }
        />
        <Route
          path="master/audit"
          element={
            <MasterOnly>
              <Suspense fallback={<Spinner />}>
                <MasterAuditPage />
              </Suspense>
            </MasterOnly>
          }
        />
        <Route
          path="master/usage"
          element={
            <MasterOnly>
              <Suspense fallback={<Spinner />}>
                <MasterUsagePage />
              </Suspense>
            </MasterOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
