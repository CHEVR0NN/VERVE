'use client';

import { useState } from 'react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { ExecutionPanel } from './components/ExecutionPanel';
import './automation.css';

type PanelTab = 'inspector' | 'log';

export default function AutomationPage() {
  const [tab, setTab] = useState<PanelTab>('inspector');

  return (
    <div className="automation-page h-screen w-full flex flex-col bg-bg text-ink">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <Canvas />
        </div>
        <div className="w-[var(--panel-width)] shrink-0 border-l border-[var(--hairline)] flex flex-col">
          <div className="flex border-b border-[var(--hairline)]">
            {(['inspector', 'log'] as PanelTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 font-ui text-[11px] font-semibold tracking-[0.1em] uppercase ${
                  tab === t ? 'text-ink border-b-2 border-gold' : 'text-muted'
                }`}
              >
                {t === 'inspector' ? 'Inspector' : 'Execution Log'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === 'inspector' ? <Inspector /> : <ExecutionPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
