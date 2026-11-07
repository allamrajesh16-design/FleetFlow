import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatters';
import CountUp from './CountUp';
import './Charts.css';

/**
 * LineChart component written in pure SVG and CSS.
 * Path draws from left to right, then area gradient fades in.
 */
export function LineChart({
  data = [],
  height = 240,
  currency = '₹',
  valuePrefix = '',
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className={`chart-empty-box ${className}`} style={{ height }}>
        <span>No chart data available</span>
      </div>
    );
  }

  const svgWidth = 600;
  const svgHeight = height;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const rawValues = data.map((d) => Number(d.amount ?? d.value ?? 0));
  const maxVal = Math.max(...rawValues, 100);
  const roundedMax = Math.ceil(maxVal * 1.15); // 15% headroom

  const getX = (idx) => {
    if (data.length <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (data.length - 1)) * chartW;
  };

  const getY = (val) => {
    return padTop + chartH - (val / roundedMax) * chartH;
  };

  const points = data.map((d, idx) => {
    const val = Number(d.amount ?? d.value ?? 0);
    return {
      x: getX(idx),
      y: getY(val),
      val,
      label: d.month || d.label || `M${idx + 1}`,
    };
  });

  const linePathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaPathD =
    points.length > 0
      ? `${linePathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${
          padTop + chartH
        } Z`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: padTop + chartH - pct * chartH,
    val: Math.round(pct * roundedMax),
  }));

  return (
    <div className={`line-chart-wrapper ${className}`}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="line-chart-svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines and Y-axis text */}
        {yTicks.map((tick, idx) => (
          <g key={idx} className="chart-grid-group">
            <line
              x1={padLeft}
              y1={tick.y}
              x2={padLeft + chartW}
              y2={tick.y}
              stroke="var(--border)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x={padLeft - 10}
              y={tick.y + 4}
              textAnchor="end"
              className="chart-axis-text"
            >
              {formatMoney(tick.val, currency ? `${currency} ` : valuePrefix)}
            </text>
          </g>
        ))}

        {/* Area fill (fades in after stroke) */}
        {areaPathD && (
          <path d={areaPathD} fill="url(#areaGradient)" className="chart-area-fill" />
        )}

        {/* Primary Polyline (draws stroke-dashoffset left to right) */}
        {linePathD && (
          <path
            d={linePathD}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="chart-line-stroke"
          />
        )}

        {/* X-axis labels and interactive circles */}
        {points.map((pt, idx) => (
          <g
            key={idx}
            className="chart-point-group"
            onMouseEnter={() => setHoverIndex(idx)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" style={{ cursor: 'pointer' }} />
            <text
              x={pt.x}
              y={padTop + chartH + 20}
              textAnchor="middle"
              className="chart-axis-text"
            >
              {pt.label}
            </text>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === idx ? 6 : 4}
              fill="var(--surface)"
              stroke="var(--chart-1)"
              strokeWidth={hoverIndex === idx ? 3 : 2}
              className="chart-dot"
            />
          </g>
        ))}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(points[hoverIndex].x / svgWidth) * 100}%`,
            top: `${(points[hoverIndex].y / svgHeight) * 100}%`,
          }}
        >
          <div className="chart-tooltip-month">{points[hoverIndex].label}</div>
          <div className="chart-tooltip-val">
            {formatMoney(points[hoverIndex].val, currency ? `${currency} ` : valuePrefix)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DonutChart component written in pure SVG and CSS.
 * Segments sweep around one after another and center total counts up with CountUp.
 */
export function DonutChart({
  data = [],
  size = 220,
  centerValue = null,
  centerLabel = 'Total',
  className = '',
}) {
  const total = data.reduce((acc, d) => acc + Number(d.value || d.count || 0), 0);
  const displayTotal = centerValue !== null ? centerValue : total;

  // Circle dimensions
  const radius = 68;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius; // ~427.25

  let accumulatedPercent = 0;

  return (
    <div className={`donut-chart-container ${className}`}>
      <div className="donut-chart-svg-box" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 180 180"
          className="donut-chart-svg"
          style={{ width: size, height: size }}
        >
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="transparent"
            stroke="var(--neutral-bg)"
            strokeWidth={strokeWidth}
          />

          {total > 0 &&
            data.map((item, idx) => {
              const val = Number(item.value || item.count || 0);
              const percent = val / total;
              const strokeDasharray = `${percent * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += percent;

              return (
                <circle
                  key={idx}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="transparent"
                  stroke={item.color || 'var(--chart-1)'}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="donut-slice"
                  style={{ animationDelay: `${idx * 120}ms` }}
                  transform="rotate(-90 90 90)"
                />
              );
            })}
        </svg>

        <div className="donut-center-text">
          <span className="donut-center-val">
            <CountUp value={displayTotal} duration={800} />
          </span>
          <span className="donut-center-lbl">{centerLabel}</span>
        </div>
      </div>

      <div className="donut-legend">
        {data.map((item, idx) => {
          const val = Number(item.value || item.count || 0);
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          return (
            <div key={idx} className="donut-legend-item">
              <span
                className="donut-legend-dot"
                style={{ backgroundColor: item.color || 'var(--chart-1)' }}
              />
              <span className="donut-legend-name">{item.label}</span>
              <strong className="donut-legend-count">{val}</strong>
              <span className="donut-legend-pct">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * BarChart component written in pure SVG and CSS.
 * Bars grow from baseline with a stagger, hover tooltip fades in.
 */
export function BarChart({
  data = [],
  height = 240,
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className={`chart-empty-box ${className}`} style={{ height }}>
        <span>No chart data available</span>
      </div>
    );
  }

  const svgWidth = 600;
  const svgHeight = height;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const rawValues = data.map((d) => Number(d.value ?? d.count ?? 0));
  const maxVal = Math.max(...rawValues, 10);
  const barWidth = Math.min(36, (chartW / data.length) * 0.6);

  return (
    <div className={`bar-chart-wrapper ${className}`}>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="bar-chart-svg">
        {data.map((item, idx) => {
          const val = Number(item.value ?? item.count ?? 0);
          const barH = (val / maxVal) * chartH;
          const x = padLeft + (idx / data.length) * chartW + (chartW / data.length - barWidth) / 2;
          const y = padTop + chartH - barH;

          return (
            <g
              key={idx}
              className="bar-chart-group"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="4"
                fill={item.color || 'var(--chart-1)'}
                className="bar-chart-rect"
                style={{
                  transformOrigin: `${x + barWidth / 2}px ${padTop + chartH}px`,
                  animationDelay: `${idx * 60}ms`,
                }}
              />
              <text
                x={x + barWidth / 2}
                y={padTop + chartH + 20}
                textAnchor="middle"
                className="chart-axis-text"
              >
                {item.label || item.month || `B${idx + 1}`}
              </text>
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="chart-tooltip"
          style={{
            left: `${((padLeft + (hoverIndex / data.length) * chartW + chartW / data.length / 2) / svgWidth) * 100}%`,
            top: '40%',
          }}
        >
          <div className="chart-tooltip-month">{data[hoverIndex].label}</div>
          <div className="chart-tooltip-val">{data[hoverIndex].value ?? data[hoverIndex].count}</div>
        </div>
      )}
    </div>
  );
}
