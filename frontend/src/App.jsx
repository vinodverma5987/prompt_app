import { useSelector } from 'react-redux';
import { ArrowUpRight } from 'lucide-react';
import { RequestHistory } from './features/requests/RequestHistory';
import { PromptForm } from './features/requests/PromptForm';
import { InsightsPanel } from './features/insights/InsightsPanel';
import { selectActiveRequest } from './features/requests/requestsSlice';
export default function App() {
  const activeRequest = useSelector(selectActiveRequest);
  const busy = useSelector((state) =>
    state.requests.entries.some((entry) => entry.status === 'PENDING'),
  );
  return (
    <div className="app-shell">
      <RequestHistory busy={busy} />
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb-slash">/</span> <strong>Prompt explorer</strong>
          </span>
          <a href="/docs" target="_blank" rel="noreferrer">
            API docs <ArrowUpRight size={15} />
          </a>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="section-kicker">THINK IT. ASK IT. EXPLORE IT.</div>
              <h1>
                From questions to clarity<span>.</span>
              </h1>
              <p>A space to shape your questions and make sense of the answers.</p>
            </div>
            <span className="workspace-badge">
              PLAYGROUND <span>01</span>
            </span>
          </div>
          <div className="workspace-grid">
            <PromptForm
              key={activeRequest?.id ?? 'new'}
              activeRequest={activeRequest}
              busy={busy}
            />
            <InsightsPanel activeRequest={activeRequest} />
          </div>
          <footer className="workspace-footer">
            <span>Made for a curious mind.</span>
            <span>
              Prompt Studio <span className="footer-dot">·</span> Demo data, real possibilities
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
