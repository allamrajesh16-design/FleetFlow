import React, { useState } from 'react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import CountUp from '../../components/common/CountUp';
import Stagger from '../../components/common/Stagger';
import './DevMotionPage.css';

export default function DevMotionPage() {
  const [replayKey, setReplayKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeSpeed, setActiveSpeed] = useState(1);

  const handleReplay = () => {
    setReplayKey((k) => k + 1);
  };

  const handleSpeedChange = (scale) => {
    setActiveSpeed(scale);
    document.documentElement.style.setProperty('--motion-scale', scale);
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1300);
  };

  return (
    <div className="dev-motion-page">
      <header className="dev-motion-header">
        <h1>Motion System Dev Bench</h1>
        <p>Interactive testing for all CSS and React motion primitives</p>
        <div className="dev-motion-controls">
          <Button variant="primary" onClick={handleReplay}>
            Replay All
          </Button>
          <div className="dev-speed-btns">
            <span>Speed Scale:</span>
            <Button
              variant={activeSpeed === 0.5 ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleSpeedChange(0.5)}
            >
              2x Fast (0.5x)
            </Button>
            <Button
              variant={activeSpeed === 1 ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleSpeedChange(1)}
            >
              Normal (1x)
            </Button>
            <Button
              variant={activeSpeed === 2 ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleSpeedChange(2)}
            >
              Slow (2x)
            </Button>
          </div>
        </div>
      </header>

      <div className="dev-motion-grid" key={replayKey}>
        {/* 1. Entrances */}
        <Card className="dev-card">
          <h3>Entrance Primitives</h3>
          <div className="dev-box-row">
            <div className="dev-box motion-fade-in">Fade In</div>
            <div className="dev-box motion-fade-rise">Fade Rise</div>
            <div className="dev-box motion-scale-in">Scale In</div>
            <div className="dev-box motion-pop-in">Pop In</div>
          </div>
        </Card>

        {/* 2. Feedback */}
        <Card className="dev-card">
          <h3>Feedback & Attention</h3>
          <div className="dev-box-row">
            <div className="dev-box dev-shake">Shake Error</div>
            <div className="dev-box btn-glow-pulse-3s">Glow Pulse</div>
            <div className="dev-box dev-bell">
              <span className="dev-bell-icon">🔔</span> Bell Swing
            </div>
          </div>
        </Card>

        {/* 3. CountUp */}
        <Card className="dev-card">
          <h3>CountUp Numbers</h3>
          <div className="dev-counter-row">
            <div className="dev-counter-item">
              <strong>
                <CountUp key={`cA-${replayKey}`} value={12450} duration={800} />
              </strong>
              <span>Trips Completed</span>
            </div>
            <div className="dev-counter-item">
              <strong>
                <CountUp key={`cB-${replayKey}`} value="₹4.8 Cr" duration={800} />
              </strong>
              <span>Payments Secured</span>
            </div>
            <div className="dev-counter-item">
              <strong>
                <CountUp key={`cC-${replayKey}`} value="99.8%" duration={800} />
              </strong>
              <span>On-time Rate</span>
            </div>
          </div>
        </Card>

        {/* 4. Ambient Loops */}
        <Card className="dev-card">
          <h3>Ambient Indicators (60 fps)</h3>
          <div className="dev-ambient-row">
            <div className="dev-ambient-item">
              <span className="motion-live-dot" />
              <span>IN_PROGRESS Live Dot</span>
            </div>
            <div className="dev-ambient-item">
              <span className="dev-badge motion-pulse-expiring">Expiring (2 pulses)</span>
            </div>
            <div className="dev-ambient-item">
              <div className="dev-radar-box">
                <span className="dev-radar-ring" />
                <span className="dev-radar-center" />
              </div>
              <span>Radar Signal</span>
            </div>
            <div className="dev-ambient-item">
              <div className="motion-float dev-float-icon">🚚</div>
              <span>Floating Empty State</span>
            </div>
          </div>
        </Card>

        {/* 5. Stagger */}
        <Card className="dev-card">
          <h3>Stagger Utility (40ms, max 12)</h3>
          <Stagger className="dev-stagger-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dev-stagger-chip">
                Item #{i + 1}
              </div>
            ))}
          </Stagger>
        </Card>

        {/* 6. Confetti Burst */}
        <Card className="dev-card">
          <h3>Role Moments: Confetti Burst</h3>
          <div style={{ position: 'relative', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Button variant="success" onClick={triggerConfetti}>
              Trigger Confetti Burst
            </Button>
            {showConfetti && (
              <div className="motion-confetti-container" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, i) => {
                  const angle = (i / 16) * 360;
                  const rad = (angle * Math.PI) / 180;
                  const dist = 60 + (i % 4) * 20;
                  const x = Math.cos(rad) * dist;
                  const y = Math.sin(rad) * dist;
                  const colors = ['var(--chart-3)', 'var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-5)'];
                  return (
                    <span
                      key={i}
                      className="motion-confetti-piece"
                      style={{
                        '--confetti-x': `${x}px`,
                        '--confetti-y': `${y}px`,
                        '--confetti-rot': `${angle * 2}deg`,
                        backgroundColor: colors[i % colors.length],
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
