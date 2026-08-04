export function BaseNode({
  kind, title, subtitle, selected, accent,
}: {
  kind: string; title: string; subtitle?: string; selected?: boolean; accent: string;
}) {
  return (
    <div
      className={`min-w-[180px] rounded-[10px] border px-3.5 py-3 shadow-[var(--shadow-lg)] bg-[var(--card)] text-ink ${
        selected ? 'border-gold' : 'border-[var(--hairline)]'
      }`}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="font-ui text-[9px] font-semibold tracking-[0.12em] uppercase text-muted mb-1">{kind}</div>
      <div className="font-display text-[13px] font-semibold leading-tight">{title}</div>
      {subtitle && <div className="font-ui text-[11px] text-muted mt-1 leading-snug">{subtitle}</div>}
    </div>
  );
}
