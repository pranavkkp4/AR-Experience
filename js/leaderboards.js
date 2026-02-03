const { createElement: h, useEffect, useState } = React;

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '';

const PAGE_SIZE = 5;

function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function formatRank(index) {
  const rank = index + 1;
  const medal = rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : '';
  const medalTag = medal ? ` (${medal})` : '';
  return { rank, medalTag };
}

function Board({ title, data, onPrev, onNext }) {
  const entries = data.entries || [];
  const hasPrev = data.offset > 0;
  const hasNext = data.offset + data.limit < data.total;

  return h('section', { className: 'board' }, [
    h('h2', { key: 'title' }, title),
    entries.length === 0
      ? h('p', { key: 'empty', className: 'muted' }, 'No scores yet. Be the first!')
      : h('ol', { key: 'list' }, entries.map((entry, idx) => {
          const { rank, medalTag } = formatRank(data.offset + idx);
          const timeTag = entry.created_at ? ` (${formatTime(entry.created_at)})` : '';
          return h('li', { key: `${entry.name}-${entry.score}-${idx}` },
            `${rank}. ${entry.name} — ${entry.score}${medalTag}${timeTag}`
          );
        })),
    h('div', { key: 'pager', className: 'pager' }, [
      h('button', { key: 'prev', className: 'pager-btn', onClick: onPrev, disabled: !hasPrev }, 'Prev'),
      h('span', { key: 'page', className: 'muted' },
        `Showing ${data.offset + 1}-${Math.min(data.offset + data.limit, data.total)} of ${data.total}`),
      h('button', { key: 'next', className: 'pager-btn', onClick: onNext, disabled: !hasNext }, 'Next')
    ])
  ]);
}

function LeaderboardsApp() {
  const [fruit, setFruit] = useState({ entries: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [potato, setPotato] = useState({ entries: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [status, setStatus] = useState('Loading leaderboards...');
  const [lastUpdated, setLastUpdated] = useState('');

  const loadGame = async (game, offset) => {
    const res = await fetch(`${API_BASE}/api/leaderboards/${game}?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed');
    return res.json();
  };

  const loadAll = async () => {
    setStatus('Loading leaderboards...');
    try {
      const [fruitData, potatoData] = await Promise.all([
        loadGame('fruit', fruit.offset),
        loadGame('potato', potato.offset)
      ]);
      setFruit({
        entries: fruitData.entries || [],
        total: fruitData.total || 0,
        limit: fruitData.limit || PAGE_SIZE,
        offset: fruitData.offset || 0
      });
      setPotato({
        entries: potatoData.entries || [],
        total: potatoData.total || 0,
        limit: potatoData.limit || PAGE_SIZE,
        offset: potatoData.offset || 0
      });
      setStatus('Updated just now.');
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      setStatus('Unable to reach the leaderboard server.');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  return h('div', { id: 'leaderboardRoot' }, [
    h('div', { key: 'toolbar', className: 'toolbar' }, [
      h('div', { key: 'status', className: 'status' }, status),
      h('div', { key: 'updated', className: 'muted' }, lastUpdated ? `Last updated: ${lastUpdated}` : ''),
      h('button', { key: 'refresh', className: 'refresh-btn', onClick: loadAll }, 'Refresh')
    ]),
    h('div', { key: 'grid', className: 'leaderboard-grid' }, [
      h(Board, {
        key: 'fruit',
        title: 'Fruit Catcher',
        data: fruit,
        onPrev: () => {
          const nextOffset = Math.max(fruit.offset - PAGE_SIZE, 0);
          loadGame('fruit', nextOffset).then((data) => {
            setFruit({ entries: data.entries || [], total: data.total || 0, limit: data.limit || PAGE_SIZE, offset: data.offset || 0 });
          });
        },
        onNext: () => {
          const nextOffset = fruit.offset + PAGE_SIZE;
          loadGame('fruit', nextOffset).then((data) => {
            setFruit({ entries: data.entries || [], total: data.total || 0, limit: data.limit || PAGE_SIZE, offset: data.offset || 0 });
          });
        }
      }),
      h(Board, {
        key: 'potato',
        title: 'Potato Run',
        data: potato,
        onPrev: () => {
          const nextOffset = Math.max(potato.offset - PAGE_SIZE, 0);
          loadGame('potato', nextOffset).then((data) => {
            setPotato({ entries: data.entries || [], total: data.total || 0, limit: data.limit || PAGE_SIZE, offset: data.offset || 0 });
          });
        },
        onNext: () => {
          const nextOffset = potato.offset + PAGE_SIZE;
          loadGame('potato', nextOffset).then((data) => {
            setPotato({ entries: data.entries || [], total: data.total || 0, limit: data.limit || PAGE_SIZE, offset: data.offset || 0 });
          });
        }
      })
    ])
  ]);
}

const root = ReactDOM.createRoot(document.querySelector('main'));
root.render(h(LeaderboardsApp));
