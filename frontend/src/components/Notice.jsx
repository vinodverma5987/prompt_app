import { AlertCircle, MessageCircle } from 'lucide-react';
export function Notice({ kind = 'error', title, message, details = [], children }) {
  const Icon = kind === 'clarification' ? MessageCircle : AlertCircle;
  return (
    <div className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {details.length > 0 && (
          <ul>
            {details.map((detail, index) => (
              <li key={index}>
                {detail.field}: {detail.message}
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </div>
  );
}
