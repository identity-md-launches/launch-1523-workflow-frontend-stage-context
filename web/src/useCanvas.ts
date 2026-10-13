import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { makeReader, type Deployment, type Provider } from './config.ts';
import { PaintFeed, readCanvas, verifyContract } from './chain.ts';

export function useCanvas(deployment: Deployment, account?: Address, provider?: Provider) {
  const reader = useMemo(() => makeReader(deployment, provider), [deployment, provider]);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof readCanvas>>>();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [feed, setFeed] = useState<{ events: PaintFeed['events']; complete: boolean }>({ events: [], complete: false });
  const [feedError, setFeedError] = useState('');
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const reload = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false, active = false, feedActive = false, isVerified = false;
    const history = new PaintFeed(reader, deployment);
    setVerified(false); setError(''); setFeedError('');
    const refresh = async () => {
      if (active || cancelled) return;
      active = true; setRefreshing(true);
      try {
        if (!isVerified) { await verifyContract(reader, deployment); isVerified = true; }
        const state = await readCanvas(reader, deployment, account);
        if (cancelled) return;
        setVerified(true); setSnapshot(state); setError('');
        if (!feedActive) {
          feedActive = true;
          void history.refresh(state.block).then(result => {
            if (!cancelled) { setFeed(result); setFeedLoaded(true); setFeedError(''); }
          }).catch(() => { if (!cancelled) setFeedError('Activity could not refresh. Displayed paints may be out of date.'); })
            .finally(() => { feedActive = false; });
        }
      } catch {
        if (!cancelled) { setError('Canvas connection interrupted. Check your connection and retry.'); setVerified(false); isVerified = false; }
      } finally { active = false; if (!cancelled) setRefreshing(false); }
    };
    reload.current = refresh;
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 4000);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', resume); };
  }, [reader, deployment, account]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const refresh = useCallback(() => reload.current(), []);
  const age = snapshot ? Math.max(0, Math.floor((now - snapshot.fetchedAt) / 1000)) : undefined;
  const fresh = verified && !error && age !== undefined && age < 20;
  const accountReady = !!account && snapshot?.account === account && snapshot.nextPaintAt !== undefined && fresh;
  // Countdown is an estimate from the latest observed chain timestamp; eligibility stays based on chain time.
  const remaining = snapshot && accountReady ? Math.max(0, Number(snapshot.nextPaintAt) - snapshot.chainTime - Math.max(0, (now - snapshot.fetchedAt) / 1000)) : 0;
  const eligible = accountReady && Number(snapshot!.nextPaintAt) <= snapshot!.chainTime;
  return { reader, snapshot, verified, error, refreshing, feed, feedError, feedLoaded, age, fresh, accountReady, remaining: Math.ceil(remaining), eligible, refresh };
}
