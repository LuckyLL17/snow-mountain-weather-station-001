import { useMemo, useState } from 'react';

type Sensor = { id: string; name: string; code: string; value: string; unit: string; trend: string; status: '正常' | '注意' | '离线'; color: string; points: number[] };
type Reading = { sensor: string; value: number; unit: string };
type Alert = { time: string; title: string; desc: string; kind: 'warning' | 'good' };
const initialSensors: Sensor[] = [
  { id: 'temp', name: '山脊温度', code: 'TMP-01', value: '-8.4', unit: '°C', trend: '↓ 1.2°', status: '正常', color: '#78d7ef', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50] },
  { id: 'wind', name: '风速 / 风向', code: 'WND-02', value: '18.6', unit: 'm/s', trend: '↑ 3.8', status: '注意', color: '#f2bc71', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62] },
  { id: 'snow', name: '积雪深度', code: 'SNW-03', value: '142', unit: 'cm', trend: '↑ 4 cm', status: '正常', color: '#bba4ff', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28] },
  { id: 'power', name: '电池组电量', code: 'PWR-04', value: '76', unit: '%', trend: '↓ 2%', status: '正常', color: '#94df9a', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76] }
];
const initialAlerts: Alert[] = [{ time: '09:42', title: '风速超过巡检阈值', desc: '当前 18.6 m/s · 建议延后无人机巡检', kind: 'warning' }, { time: '08:15', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' }, { time: '06:30', title: '卫星链路已同步', desc: '上行延迟 2.4 秒 · 下一次同步 12:30', kind: 'good' }];
const trendSuffix: Record<string, string> = { temp: '°', wind: '', snow: ' cm', power: '%' };
const pad = (n: number) => String(n).padStart(2, '0');
function formatSyncTime(iso: string) { const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function formatClock(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function deriveStatus(id: string, value: number): Sensor['status'] {
  if (id === 'wind') return value >= 15 ? '注意' : '正常';
  if (id === 'power') return value <= 30 ? '注意' : '正常';
  return '正常';
}
function applyReadings(prev: Sensor[], readings: Reading[]): Sensor[] {
  return prev.map(sensor => {
    const reading = readings.find(item => item.sensor === sensor.code);
    if (!reading) return sensor;
    const diff = reading.value - Number(sensor.value);
    const magnitude = sensor.id === 'temp' || sensor.id === 'wind' ? Math.abs(diff).toFixed(1) : String(Math.round(Math.abs(diff)));
    const lastPoint = sensor.points[sensor.points.length - 1];
    const nextPoint = Math.min(64, Math.max(6, Math.round(lastPoint + diff * 3)));
    return { ...sensor, value: String(reading.value), unit: reading.unit, trend: `${diff >= 0 ? '↑' : '↓'} ${magnitude}${trendSuffix[sensor.id] ?? ''}`, status: deriveStatus(sensor.id, reading.value), points: [...sensor.points.slice(1), nextPoint] };
  });
}
function MiniChart({ points, color }: { points: number[]; color: string }) { const coords = points.map((p, index) => `${(index / (points.length - 1)) * 100},${70 - p}`).join(' '); return <svg className="mini-chart" viewBox="0 0 100 70" preserveAspectRatio="none"><defs><linearGradient id={`fill-${color.replace('#','')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs><polygon points={`0,70 ${coords} 100,70`} fill={`url(#fill-${color.replace('#','')})`} /><polyline points={coords} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg>; }
function MountainScene() { return <div className="mountain-scene"><div className="stars"/><div className="sun-glow"/><div className="mountain back"/><div className="mountain mid"/><div className="mountain front"/><div className="station"><span className="mast"/><span className="station-box"/><span className="antenna"/></div><div className="scene-caption"><span>海拔 4,820 m</span><span>自动观测站 · M-07</span></div></div>; }
export default function App() {
  const [sensors, setSensors] = useState(initialSensors);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selectedId, setSelectedId] = useState('wind');
  const [range, setRange] = useState('24 小时');
  const [notice, setNotice] = useState('');
  const [syncedAt, setSyncedAt] = useState('2026.09.25 10:04');
  const [latency, setLatency] = useState('2.4s');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const selected = sensors.find(sensor => sensor.id === selectedId) ?? sensors[0];
  const summary = useMemo(() => ({ normal: sensors.filter(s => s.status === '正常').length, attention: sensors.filter(s => s.status === '注意').length }), [sensors]);
  async function refresh() {
    if (syncing) return;
    setSyncing(true);
    const startedAt = performance.now();
    try {
      const syncResponse = await fetch('/api/sync', { method: 'POST' });
      if (!syncResponse.ok) throw new Error(`sync rejected: ${syncResponse.status}`);
      const syncResult: { syncedAt?: string } = await syncResponse.json();
      const readingsResponse = await fetch('/api/readings');
      if (!readingsResponse.ok) throw new Error(`readings failed: ${readingsResponse.status}`);
      const readings: Reading[] = await readingsResponse.json();
      const roundTrip = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
      setSensors(prev => applyReadings(prev, readings));
      setSyncedAt(formatSyncTime(syncResult.syncedAt ?? new Date().toISOString()));
      setLatency(roundTrip);
      setSyncError(false);
      setNotice('已同步最新卫星数据');
      setAlerts(prev => [{ time: formatClock(new Date()), title: '卫星链路已同步', desc: `上行延迟 ${roundTrip} · 读数已更新`, kind: 'good' as const }, ...prev].slice(0, 6));
    } catch {
      setSyncError(true);
      setNotice('同步失败，已保留当前可信数据');
      setAlerts(prev => [{ time: formatClock(new Date()), title: '卫星同步失败', desc: '保留上一组可信读数 · 请稍后重试', kind: 'warning' as const }, ...prev].slice(0, 6));
    } finally {
      setSyncing(false);
    }
  }
  const syncLabel = syncing ? '正在同步卫星数据…' : syncError ? `同步失败 · 显示 ${syncedAt} 的可信数据` : `数据已同步 · ${syncedAt}`;
  return <div className="dashboard"><header className="topbar"><div className="brand"><div className="brand-icon">✦</div><div><span className="eyebrow">ALPINE OBSERVATORY / M-07</span><h1>雪线气象站 · 运行总览</h1></div></div><div className="top-meta"><span className={syncError ? 'sync error' : 'sync'}><i/>{syncLabel}</span><button onClick={refresh} disabled={syncing}>{syncing ? '↻ 同步中…' : '↻ 刷新数据'}</button><div className="profile">陈 <span>值守员</span></div></div></header><main className="main"><section className="status-strip"><div><span className="eyebrow">STATION STATUS</span><h2>高海拔自动气象观测站</h2><p>北麓冰川保护区 · 当前气象窗口良好</p></div><div className="status-numbers"><div><strong className="cyan">{summary.normal}</strong><span>传感器正常</span></div><div><strong className="amber">{summary.attention}</strong><span>需要关注</span></div><div><strong>{latency}</strong><span>链路延迟</span></div></div></section><section className="overview-grid"><div className="mountain-card"><div className="card-title"><div><span className="eyebrow">LIVE TERRAIN</span><h3>站点环境</h3></div><span className="live"><i/> LIVE</span></div><MountainScene/><div className="terrain-footer"><div><span>体感温度</span><b>-14.2°C</b></div><div><span>能见度</span><b>16.8 km</b></div><div><span>气压</span><b>582 hPa</b></div><div><span>降雪</span><b>0.8 mm/h</b></div></div></div><div className="alert-card"><div className="card-title"><div><span className="eyebrow">OPERATION LOG</span><h3>观测动态</h3></div><button className="more" onClick={() => setNotice('已打开全部运行日志')}>全部 →</button></div><div className="alerts">{alerts.map(alert => <div className="alert" key={`${alert.time}-${alert.title}`}><span className={`alert-mark ${alert.kind}`}>{alert.kind === 'warning' ? '!' : '✓'}</span><div><div className="alert-line"><b>{alert.title}</b><time>{alert.time}</time></div><p>{alert.desc}</p></div></div>)}</div><button className="log-btn" onClick={() => setNotice('已创建巡检任务草稿')}>＋ 创建巡检任务</button></div></section><section className="sensor-section"><div className="section-title"><div><span className="eyebrow">SENSOR ARRAY / 04</span><h3>传感器阵列</h3></div><div className="range-switch">{['6 小时','24 小时','7 天'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="sensor-grid">{sensors.map(sensor => <button key={sensor.id} className={selectedId === sensor.id ? 'sensor-card selected' : 'sensor-card'} onClick={() => setSelectedId(sensor.id)}><div className="sensor-top"><div><span className="sensor-code">{sensor.code}</span><h4>{sensor.name}</h4></div><span className={`sensor-status ${sensor.status === '注意' ? 'warn' : ''}`}><i/>{sensor.status}</span></div><div className="sensor-reading"><strong>{sensor.value}</strong><span>{sensor.unit}</span><em className={sensor.trend.startsWith('↓') ? 'down' : ''}>{sensor.trend}</em></div><MiniChart points={sensor.points} color={sensor.color}/><div className="sensor-time">过去 {range} <span>点击查看详情</span></div></button>)}</div></section><section className="detail-section"><div className="detail-copy"><span className="eyebrow">SELECTED SENSOR / {selected.code}</span><h3>{selected.name}历史曲线</h3><p>基于自动校准后的连续观测数据，当前设备状态为 <b>{selected.status}</b>。</p><div className="detail-tags"><span>采样间隔 10 min</span><span>质量评分 98.6</span><span>海拔 4,820 m</span></div></div><div className="big-chart"><div className="chart-y"><span>20</span><span>10</span><span>0</span><span>-10</span></div><svg viewBox="0 0 520 150" preserveAspectRatio="none"><path d="M0 92 L58 78 L110 83 L168 58 L220 66 L274 44 L330 57 L381 33 L438 45 L520 20" fill="none" stroke={selected.color} strokeWidth="3"/><path d="M0 92 L58 78 L110 83 L168 58 L220 66 L274 44 L330 57 L381 33 L438 45 L520 20 L520 150 L0 150 Z" fill={selected.color} opacity=".09"/></svg><div className="chart-x"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>现在</span></div></div></section>{notice && <div className="toast" onClick={() => setNotice('')}>{notice}<span>×</span></div>}</main></div>;
}
