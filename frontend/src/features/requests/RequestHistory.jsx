import { useDispatch, useSelector } from 'react-redux';
import { Check, CircleHelp, Clock3, Plus, TriangleAlert } from 'lucide-react';
import { newRequest, selectRequest } from './requestsSlice';
const statusLabels = {
  SUCCESS: 'Complete',
  NEEDS_CLARIFICATION: 'Needs details',
  PENDING: 'Generating',
  ERROR: 'Failed',
};
const statusIcons = {
  SUCCESS: Check,
  NEEDS_CLARIFICATION: CircleHelp,
  PENDING: Clock3,
  ERROR: TriangleAlert,
};
export function RequestHistory({ busy }) {
  const dispatch = useDispatch();
  const { entries, activeId } = useSelector((state) => state.requests);
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Prompt Studio home">
        <span className="brand-mark">
          p<span>•</span>
        </span>
        <span>
          prompt<span className="brand-light">studio</span>
        </span>
      </a>
      <button className="new-request" disabled={busy} onClick={() => dispatch(newRequest())}>
        <Plus size={18} /> New request
      </button>
      <div className="history-heading">
        <span>RECENT REQUESTS</span>
        <span>{entries.length.toString().padStart(2, '0')}</span>
      </div>
      <nav className="history-list" aria-label="Recent requests">
        {entries.length === 0 ? (
          <div className="history-empty">
            <Clock3 size={20} />
            <p>Your ideas start here.</p>
            <span>
              Requests from this session
              <br />
              will appear in this space.
            </span>
          </div>
        ) : (
          entries.map((entry) => {
            const Icon = statusIcons[entry.status];
            return (
              <button
                className={`history-item ${activeId === entry.id ? 'is-active' : ''}`}
                key={entry.id}
                aria-current={activeId === entry.id ? 'true' : undefined}
                disabled={busy}
                onClick={() => dispatch(selectRequest(entry.id))}
              >
                <span className="history-prompt">{entry.input.prompt}</span>
                <span className={`history-status status-${entry.status.toLowerCase()}`}>
                  <Icon size={13} />
                  {statusLabels[entry.status]}
                  <span className="history-language">
                    {entry.input.targetLanguage.toUpperCase()}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">Y</div>
        <div>
          <strong>Your workspace</strong>
          <span>Local demo · session history</span>
        </div>
      </div>
    </aside>
  );
}
