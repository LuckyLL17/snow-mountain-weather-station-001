import { useEffect, useMemo, useState } from 'react';

type SensorStatus = '正常' | '注意' | '离线';
type Sensor = {
  id: string;
  name: string;
  code: string;
  value: string;
  unit: string;
  trend: string;
  status: SensorStatus;
  color: string;
  points: number[];
  decimals: number;
};

const initialSensors: Sensor[] = [
  { id: 'temp', name: '山脊温度', code: 'TMP-01', value: '-8.4', unit: '°C', trend: '↓ 1.2°', status: '正常', color: '#78d7ef', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50], decimals: 1 },
  { id: 'wind', name: '风速 / 风向', code: 'WND-02', value: '18.6', unit: 'm/s', trend: '↑ 3.8', status: '注意', color: '#f2bc71', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62], decimals: 1 },
  { id: 'snow', name: '积雪深度', code: 'SNW-03', value: '142', unit: 'cm', trend: '↑ 4 cm', status: '正常', color: '#bba4ff', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28], decimals: 0 },
  { id: 'power', name: '电池组电量', code: 'PWR-04', value: '76', unit: '%', trend: '↓ 2%', status: '正常', color: '#94df9a', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76], decimals: 0 },
];

const alerts = [
  { time: '09:42', title: '风速超过巡检阈值', desc: '当前 18.6 m/s · 建议延后无人机巡检', kind: 'warning' },
  { time: '08:15', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' },
  { time: '06:30', title: '卫星链路已同步', desc: '上行延迟 2.4 秒 · 下一次同步 12:30', kind: 'good' },
];

type ServerReading = {
  sensor: string;
  value: number;
  unit: string;
  trend: string;
  status: SensorStatus;
  points: number[];
};

// 以服务端读数覆盖当前卡片；没有匹配读数的传感器保持原有可信数据
function mergeReadings(previous: Sensor[], readings: ServerReading[]): Sensor[] {
  return previous.map(sensor => {
    const reading = readings.find(item => item.sensor === sensor.code);
    if (!reading) return sensor;
    return {
      ...sensor,
      value: reading.value.toFixed(sensor.decimals),
      trend: reading.trend,
      status: reading.status,
      points: Array.isArray(reading.points) && reading.points.length > 0 ? reading.points : sensor.points,
    };
  });
}

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type SyncState = { status: 'idle' | 'syncing' | 'synced' | 'failed'; at: string | null };
type Notice = { text: string; kind: 'info' | 'error' };

function MiniChart({ points, color }: { points: number[]; color: string }) {
  const coords = points.map((p, index) => `${(index / (points.length - 1)) * 100},${70 - p}`).join(' ');
  return (
    <svg className="mini-chart" viewBox="0 0 100 70" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`fill-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,70 ${coords} 100,70`} fill={`url(#fill-${color.replace('#', '')})`} />
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MountainScene() {
  return (
    <div className="mountain-scene">
      <div className="stars" />
      <div className="sun-glow" />
      <div className="mountain back" />
      <div className="mountain mid" />
      <div className="mountain front" />
      <div className="station"><span className="mast" /><span className="station-box" /><span className="antenna" /></div>
      <div className="scene-caption"><span>海拔 4,820 m</span><span>自动观测站 · M-07</span></div>
    </div>
  );
}

export default function App() {
  const [sensors, setSensors] = useState<Sensor[]>(initialSensors);
  const [selectedId, setSelectedId] = useState('wind');
  const [range, setRange] = useState('24 小时');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle', at: null });

  const selected = sensors.find(sensor => sensor.id === selectedId) ?? sensors[0];
  const summary = useMemo(
    () => ({
      normal: sensors.filter(s => s.status === '正常').length,
      attention: sensors.filter(s => s.status === '注意').length,
    }),
    [sensors],
  );

  const detailPath = useMemo(() => {
    const coords = selected.points.map((p, index) => `${(index / (selected.points.length - 1)) * 520},${150 - (p / 70) * 150}`);
    const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`).join(' ');
    return { line, area: `${line} L520,150 L0,150 Z` };
  }, [selected]);

  // 信息提示自动消失；错误提示保留到值守员手动关闭
  useEffect(() => {
    if (notice?.kind !== 'info') return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleRefresh = async () => {
    if (syncState.status === 'syncing') return;
    setSyncState(previous => ({ ...previous, status: 'syncing' }));
    setNotice({ text: '正在请求最新卫星数据…', kind: 'info' });
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      if (!response.ok) throw new Error(`同步请求失败（${response.status}）`);
      const payload = await response.json();
      if (payload?.status !== 'accepted' || !Array.isArray(payload.readings)) {
        throw new Error('同步响应缺少最新读数');
      }
      setSensors(previous => mergeReadings(previous, payload.readings as ServerReading[]));
      setSyncState({ status: 'synced', at: typeof payload.syncedAt === 'string' ? payload.syncedAt : new Date().toISOString() });
      setNotice({ text: '卫星数据同步完成，读数已更新', kind: 'info' });
    } catch {
      // 失败时不覆盖任何读数、摘要和选中项，同步时间也停留在上一次成功时刻
      setSyncState(previous => ({ ...previous, status: 'failed' }));
      setNotice({ text: '同步失败，当前显示的仍是最近一次可信读数', kind: 'error' });
    }
  };

  const syncLabel =
    syncState.status === 'failed'
      ? syncState.at
        ? `同步失败 · 最近成功 ${formatSyncTime(syncState.at)}`
        : '同步失败 · 从未成功同步'
      : syncState.status === 'syncing'
        ? '正在同步卫星数据…'
        : syncState.at
          ? `数据已同步 · ${formatSyncTime(syncState.at)}`
          : '数据已同步 · 2026.09.25 10:04';

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">✦</div>
          <div>
            <span className="eyebrow">ALPINE OBSERVATORY / M-07</span>
            <h1>雪线气象站 · 运行总览</h1>
          </div>
        </div>
        <div className="top-meta">
          <span className={`sync ${syncState.status}`} title="最近一次成功同步时间"><i />{syncLabel}</span>
          <button onClick={handleRefresh} disabled={syncState.status === 'syncing'}>
            ↻ {syncState.status === 'syncing' ? '同步中…' : '刷新数据'}
          </button>
          <div className="profile">陈 <span>值守员</span></div>
        </div>
      </header>
      <main className="main">
        <section className="status-strip">
          <div>
            <span className="eyebrow">STATION STATUS</span>
            <h2>高海拔自动气象观测站</h2>
            <p>北麓冰川保护区 · 当前气象窗口良好</p>
          </div>
          <div className="status-numbers">
            <div><strong className="cyan">{summary.normal}</strong><span>传感器正常</span></div>
            <div><strong className="amber">{summary.attention}</strong><span>需要关注</span></div>
            <div><strong>2.4s</strong><span>链路延迟</span></div>
          </div>
        </section>
        <section className="overview-grid">
          <div className="mountain-card">
            <div className="card-title">
              <div><span className="eyebrow">LIVE TERRAIN</span><h3>站点环境</h3></div>
              <span className="live"><i /> LIVE</span>
            </div>
            <MountainScene />
            <div className="terrain-footer">
              <div><span>体感温度</span><b>-14.2°C</b></div>
              <div><span>能见度</span><b>16.8 km</b></div>
              <div><span>气压</span><b>582 hPa</b></div>
              <div><span>降雪</span><b>0.8 mm/h</b></div>
            </div>
          </div>
          <div className="alert-card">
            <div className="card-title">
              <div><span className="eyebrow">OPERATION LOG</span><h3>观测动态</h3></div>
              <button className="more" onClick={() => setNotice({ text: '已打开全部运行日志', kind: 'info' })}>全部 →</button>
            </div>
            <div className="alerts">
              {alerts.map(alert => (
                <div className="alert" key={alert.time}>
                  <span className={`alert-mark ${alert.kind}`}>{alert.kind === 'warning' ? '!' : '✓'}</span>
                  <div>
                    <div className="alert-line"><b>{alert.title}</b><time>{alert.time}</time></div>
                    <p>{alert.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="log-btn" onClick={() => setNotice({ text: '已创建巡检任务草稿', kind: 'info' })}>＋ 创建巡检任务</button>
          </div>
        </section>
        <section className="sensor-section">
          <div className="section-title">
            <div><span className="eyebrow">SENSOR ARRAY / 04</span><h3>传感器阵列</h3></div>
            <div className="range-switch">
              {['6 小时', '24 小时', '7 天'].map(item => (
                <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="sensor-grid">
            {sensors.map(sensor => (
              <button
                key={sensor.id}
                className={selectedId === sensor.id ? 'sensor-card selected' : 'sensor-card'}
                onClick={() => setSelectedId(sensor.id)}
              >
                <div className="sensor-top">
                  <div><span className="sensor-code">{sensor.code}</span><h4>{sensor.name}</h4></div>
                  <span className={`sensor-status ${sensor.status === '注意' ? 'warn' : ''}`}><i />{sensor.status}</span>
                </div>
                <div className="sensor-reading">
                  <strong>{sensor.value}</strong><span>{sensor.unit}</span>
                  <em className={sensor.trend.startsWith('↓') ? 'down' : ''}>{sensor.trend}</em>
                </div>
                <MiniChart points={sensor.points} color={sensor.color} />
                <div className="sensor-time">过去 {range} <span>点击查看详情</span></div>
              </button>
            ))}
          </div>
        </section>
        <section className="detail-section">
          <div className="detail-copy">
            <span className="eyebrow">SELECTED SENSOR / {selected.code}</span>
            <h3>{selected.name}历史曲线</h3>
            <p>基于自动校准后的连续观测数据，当前设备状态为 <b>{selected.status}</b>。</p>
            <div className="detail-tags">
              <span>采样间隔 10 min</span>
              <span>质量评分 98.6</span>
              <span>海拔 4,820 m</span>
            </div>
          </div>
          <div className="big-chart">
            <div className="chart-y"><span>20</span><span>10</span><span>0</span><span>-10</span></div>
            <svg viewBox="0 0 520 150" preserveAspectRatio="none">
              <path d={detailPath.line} fill="none" stroke={selected.color} strokeWidth="3" />
              <path d={detailPath.area} fill={selected.color} opacity=".09" />
            </svg>
            <div className="chart-x"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>现在</span></div>
          </div>
        </section>
        {notice && (
          <div className={`toast ${notice.kind}`} onClick={() => setNotice(null)}>
            {notice.text}<span>×</span>
          </div>
        )}
      </main>
    </div>
  );
}
