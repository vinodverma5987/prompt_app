import { memo } from 'react';
export const InsightCard = memo(function InsightCard({ insight, index }) {
  return (
    <li className="insight-card">
      <span className="insight-number">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <div className="insight-card-top">
          <h3>{insight.title}</h3>
          <span className="category">{insight.metadata.category}</span>
        </div>
        <p>{insight.content}</p>
      </div>
    </li>
  );
});
