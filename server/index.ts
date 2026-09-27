import express from 'express';
import cors from 'cors';
const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors()); app.use(express.json());
const readings = [{ sensor: 'TMP-01', value: -8.4, unit: '°C' }, { sensor: 'WND-02', value: 18.6, unit: 'm/s' }, { sensor: 'SNW-03', value: 142, unit: 'cm' }, { sensor: 'PWR-04', value: 76, unit: '%' }];
const drift: Record<string, { step: number; min: number; max: number; decimals: number }> = {
  'TMP-01': { step: 0.8, min: -15, max: -3, decimals: 1 },
  'WND-02': { step: 2.4, min: 4, max: 28, decimals: 1 },
  'SNW-03': { step: 3, min: 110, max: 170, decimals: 0 },
  'PWR-04': { step: 2, min: 55, max: 100, decimals: 0 }
};
app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }));
app.get('/api/readings', (_req, res) => res.json(readings));
app.post('/api/sync', (_req, res) => {
  for (const reading of readings) {
    const config = drift[reading.sensor];
    if (!config) continue;
    const next = reading.value + (Math.random() - 0.5) * 2 * config.step;
    reading.value = Number(Math.min(config.max, Math.max(config.min, next)).toFixed(config.decimals));
  }
  res.json({ status: 'accepted', syncedAt: new Date().toISOString() });
});
app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
