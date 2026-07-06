'use client';

import { useEffect, useState } from 'react';
import { fetchKnowledgeAnalytics, type KnowledgeAnalytics, type KnowledgeItemStat } from '@/lib/api';
import { BookOpen, GraduationCap, HelpCircle, Siren } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
}

function ItemList({ items }: { items: KnowledgeItemStat[] }) {
  if (items.length === 0) return <span className="an-null">None yet</span>;
  return (
    <div className="an-item-list">
      {items.map(item => (
        <div key={item.id} className="an-item">
          <span className="an-item-title" title={item.title}>{item.title}</span>
          {item.category && <span className="an-item-badge">{item.category}</span>}
        </div>
      ))}
    </div>
  );
}

export default function KnowledgeSection({ token }: Props) {
  const [data, setData] = useState<KnowledgeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchKnowledgeAnalytics(token)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  }, [token]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const totals = [
    { label: 'Guidebooks', value: data.totals.guidebooks, icon: <BookOpen size={16} /> },
    { label: 'FAQs', value: data.totals.faqs, icon: <HelpCircle size={16} /> },
    { label: 'Training', value: data.totals.training, icon: <GraduationCap size={16} /> },
    { label: 'Emergency', value: data.totals.emergency, icon: <Siren size={16} /> },
  ];

  return (
    <div>
      <div className="an-know-totals">
        {totals.map(t => (
          <div key={t.label} className="an-know-card">
            <div style={{ fontSize: 22, marginBottom: 6 }} aria-hidden="true">{t.icon}</div>
            <div className="an-know-value">{t.value}</div>
            <div className="an-know-label">{t.label}</div>
          </div>
        ))}
      </div>

      {!data.tracking && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          Usage tracking (view counts) is not yet enabled. Lists below show recently updated items.
        </div>
      )}

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Recent Guidebooks</div>
          <ItemList items={data.topGuidebooks} />
        </div>
        <div className="panel">
          <div className="an-chart-title">Recent FAQs</div>
          <ItemList items={data.topFaqs} />
        </div>
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Recent Training Modules</div>
          <ItemList items={data.topTraining} />
        </div>
        <div className="panel">
          <div className="an-chart-title">Emergency Protocols</div>
          <ItemList items={data.topEmergency} />
        </div>
      </div>
    </div>
  );
}
