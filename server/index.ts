import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors());
app.use(express.json());

type ReadingStatus = '正常' | '注意' | '离线';

type SensorConfig = {
  code: string;
  unit: string;
  decimals: number;
  jitter: number;
  min: number;
  max: number;
  /** 触发“注意”状态的区间（超出范围即视为需要关注） */
  normalRange: [number, number];
};

type Reading = {
  sensor: string;
  value: number;
  unit: string;
  trend: string;
  status: ReadingStatus;
  points: number[];
};

const sensorConfigs: SensorConfig[] = [
  { code: 'TMP-01', unit: '°C', decimals: 1, jitter: 1.6, min: -20, max: 0, normalRange: [-15, 0] },
  { code: 'WND-02', unit: 'm/s', decimals: 1, jitter: 3.2, min: 0, max: 30, normalRange: [0, 17] },
  { code: 'SNW-03', unit: 'cm', decimals: 0, jitter: 5, min: 80, max: 220, normalRange: [60, 200] },
  { code: 'PWR-04', unit: '%', decimals: 0, jitter: 2.4, min: 0, max: 100, normalRange: [20, 100] },
];

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function driftPoints(previous: number[], jitter: number): number[] {
  const points = previous.slice(1);
  const last = previous[previous.length - 1];
  const delta = (Math.random() - 0.5) * 2 * jitter;
  points.push(round(clamp(last + delta, 0, 70), 0));
  return points;
}

function formatTrend(delta: number, unit: string, decimals: number) {
  const direction = delta > 0 ? '↑' : '↓';
  const amount = Math.abs(delta).toFixed(decimals).replace(/\.0$/, '');
  return `${direction} ${amount}${unit === '%' ? '%' : ' ' + unit}`;
}

function buildReading(config: SensorConfig, previous: Reading): Reading {
  const value = round(clamp(previous.value + (Math.random() - 0.5) * 2 * config.jitter, config.min, config.max), config.decimals);
  const [normalMin, normalMax] = config.normalRange;
  const status: ReadingStatus = value < normalMin || value > normalMax ? '注意' : '正常';
  const points = driftPoints(previous.points, config.jitter);
  return {
    sensor: config.code,
    value,
    unit: config.unit,
    trend: formatTrend(value - previous.value, config.unit, config.decimals),
    status,
    points,
  };
}

// 首屏读数与前端初始卡片保持一致，刷新后服务端生成新的观测值
let currentReadings: Reading[] = [
  { sensor: 'TMP-01', value: -8.4, unit: '°C', trend: '↓ 1.2 °C', status: '正常', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50] },
  { sensor: 'WND-02', value: 18.6, unit: 'm/s', trend: '↑ 3.8 m/s', status: '注意', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62] },
  { sensor: 'SNW-03', value: 142, unit: 'cm', trend: '↑ 4 cm', status: '正常', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28] },
  { sensor: 'PWR-04', value: 76, unit: '%', trend: '↓ 2%', status: '正常', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76] },
];

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }),
);

app.get('/api/readings', (_req, res) => res.json(currentReadings));

app.post('/api/sync', (_req, res) => {
  // 模拟卫星链路拉取一帧新观测数据
  currentReadings = sensorConfigs.map(config => {
    const previous = currentReadings.find(reading => reading.sensor === config.code);
    return previous ? buildReading(config, previous) : currentReadings[0];
  });
  res.json({ status: 'accepted', syncedAt: new Date().toISOString(), readings: currentReadings });
});

app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
