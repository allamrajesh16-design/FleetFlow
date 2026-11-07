import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/common/Logo';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import Card from '../../components/common/Card';
import {
  VehicleIcon,
  DriverIcon,
  BookingIcon,
  TripIcon,
  QrIcon,
  ReportIcon,
  CheckIcon,
  SunIcon,
  MoonIcon,
} from '../../components/common/Icons';
import HeroVisual from './HeroVisual';
import useReveal from '../../hooks/useReveal';
import CountUp from '../../components/common/CountUp';
import Stagger from '../../components/common/Stagger';
import './LandingPage.css';

function CounterItem({ target, label, subtext }) {
  const { ref, isVisible } = useReveal({ threshold: 0.2 });

  return (
    <div ref={ref} className="landing-counter-card motion-fade-rise">
      <div className="landing-counter-val">
        <CountUp value={target} duration={900} startImmediately={isVisible} />
      </div>
      <div className="landing-counter-lbl">{label}</div>
      {subtext && <div className="landing-counter-sub">{subtext}</div>}
    </div>
  );
}

// 3D Tilt Card wrapper (desktop only, disabled for touch devices)
function TiltCard({ children, className = '' }) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    // Only on pointer: fine (desktop mice)
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Max 3 degrees tilt
    const rx = -(y / (rect.height / 2)) * 3;
    const ry = (x / (rect.width / 2)) * 3;
    setTilt({ rx, ry });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
    setIsHovered(false);
  };

  return (
    <div
      className={`feature-tilt-wrapper ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: isHovered
          ? `perspective(800px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) translateY(-4px)`
          : 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0)',
        transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.4s ease-out',
      }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const { isDark, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState('home');

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      setScrolled(isScrolled);

      // Determine active nav item based on section offsets
      const sections = ['home', 'how-it-works', 'features', 'services', 'contact'];
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop - 120;
          const height = el.offsetHeight;
          if (window.scrollY >= top && window.scrollY < top + height) {
            setActiveNav(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headlineWords = 'Smarter Fleet Management for a Better Tomorrow'.split(' ');

  const { ref: stepsRef, isVisible: stepsVisible } = useReveal({ threshold: 0.15 });
  const { ref: footerRef, isVisible: footerVisible } = useReveal({ threshold: 0.1 });

  return (
    <div className="landing-container">
      {/* Navigation Header */}
      <header className={`landing-header ${scrolled ? 'landing-header-scrolled' : ''}`}>
        <div className="landing-header-inner">
          <Logo size="medium" />

          <nav className="landing-nav" aria-label="Main Navigation">
            <a
              href="#home"
              className={`landing-nav-link ${activeNav === 'home' ? 'active' : ''}`}
            >
              Home
            </a>
            <a
              href="#how-it-works"
              className={`landing-nav-link ${activeNav === 'how-it-works' ? 'active' : ''}`}
            >
              How it works
            </a>
            <a
              href="#features"
              className={`landing-nav-link ${activeNav === 'features' ? 'active' : ''}`}
            >
              Features
            </a>
            <a
              href="#services"
              className={`landing-nav-link ${activeNav === 'services' ? 'active' : ''}`}
            >
              Services
            </a>
            <a
              href="#contact"
              className={`landing-nav-link ${activeNav === 'contact' ? 'active' : ''}`}
            >
              Contact
            </a>
          </nav>

          <div className="landing-auth-btns">
            <IconButton
              icon={isDark ? <SunIcon size={20} color="var(--amber-500, #f59e0b)" /> : <MoonIcon size={20} />}
              onClick={toggleTheme}
              ariaLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              variant="ghost"
              shape="round"
              className="landing-theme-toggle"
            />
            <Link to="/login" className="landing-login-btn">
              Sign In
            </Link>
            <Link to="/register">
              <Button variant="primary" size="small" className="landing-nav-cta">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero" id="home">
        <div className="landing-hero-content">
          <div className="landing-hero-text">
            <span className="landing-badge motion-fade-in">Enterprise Fleet Automation</span>

            {/* Word by word headline reveal with 60ms stagger and shine sweep */}
            <h1 className="landing-title">
              {headlineWords.map((word, i) => {
                const isShine = word === 'Smarter' || word === 'Fleet';
                return (
                  <span
                    key={i}
                    className={`landing-title-word ${isShine ? 'landing-shine-text' : ''}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {word}&nbsp;
                  </span>
                );
              })}
            </h1>

            <p className="landing-subtitle motion-fade-rise" style={{ animationDelay: '480ms' }}>
              FleetFlow optimizes your entire transport lifecycle: real-time GPS tracking,
              driver scheduling, seamless customer reservations, maintenance alerts, and secure QR payments.
            </p>

            <div className="landing-hero-actions motion-fade-rise" style={{ animationDelay: '580ms' }}>
              <Link to="/register">
                <Button variant="primary" size="large" className="btn-glow-pulse-3s hero-get-started-btn">
                  Get Started
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="large">
                  Learn More
                </Button>
              </a>
            </div>

            <div className="landing-stats-row motion-fade-rise" style={{ animationDelay: '680ms' }}>
              <div className="landing-mini-stat">
                <strong>99.8%</strong>
                <span>On-time Trips</span>
              </div>
              <div className="landing-stat-divider" />
              <div className="landing-mini-stat">
                <strong>10k+</strong>
                <span>Vehicles Managed</span>
              </div>
              <div className="landing-stat-divider" />
              <div className="landing-mini-stat">
                <strong>Instant</strong>
                <span>QR Verification</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Component */}
          <div className="landing-hero-visual">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Animated Counters Section */}
      <section className="landing-counters-section">
        <div className="landing-counters-grid">
          <CounterItem target="10,480" label="Vehicles Managed" subtext="Across Indian transit hubs" />
          <CounterItem target="1,24,500" label="Trips Completed" subtext="99.8% customer satisfaction" />
          <CounterItem target="85,200" label="Happy Customers" subtext="Daily commuters & passengers" />
          <CounterItem target="₹4.8 Cr" label="Payments Secured" subtext="Direct instant QR reconciliation" />
        </div>
      </section>

      {/* "How it works" steps (Register, Book, Track, Pay) */}
      <section className="landing-how-section" id="how-it-works">
        <div className="landing-features-header">
          <span className="landing-section-tag">Simple Lifecycle</span>
          <h2 className="landing-section-title">How FleetFlow Works</h2>
          <p className="landing-section-desc">
            Four streamlined steps connecting fleet operators, dispatch managers, drivers, and passengers.
          </p>
        </div>

        <div
          ref={stepsRef}
          className={`landing-steps-container ${stepsVisible ? 'steps-animated' : ''}`}
        >
          {/* Animated Connecting Line */}
          <div className="landing-steps-track" aria-hidden="true">
            <div className="landing-steps-line" />
          </div>

          <div className="landing-steps-grid">
            <div className="landing-step-item" style={{ animationDelay: '100ms' }}>
              <div className="step-circle">1</div>
              <h3 className="step-title">Register</h3>
              <p className="step-desc">Create your profile with two-factor email OTP and instant verified access.</p>
            </div>

            <div className="landing-step-item" style={{ animationDelay: '250ms' }}>
              <div className="step-circle">2</div>
              <h3 className="step-title">Book</h3>
              <p className="step-desc">Choose vehicle or bus routes with automated fare calculation and seat reserve.</p>
            </div>

            <div className="landing-step-item" style={{ animationDelay: '400ms' }}>
              <div className="step-circle">3</div>
              <h3 className="step-title">Track</h3>
              <p className="step-desc">Follow live telemetry with real-time speed, arrival estimates, and location radar.</p>
            </div>

            <div className="landing-step-item" style={{ animationDelay: '550ms' }}>
              <div className="step-circle">4</div>
              <h3 className="step-title">Pay</h3>
              <p className="step-desc">Scan dynamic QR codes to verify boarding passes with instant payment receipts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features" id="features">
        <div className="landing-features-header">
          <span className="landing-section-tag">Core Capabilities</span>
          <h2 className="landing-section-title">Everything you need to run your fleet</h2>
          <p className="landing-section-desc">
            Engineered for high performance, dispatch accuracy, and transparent customer booking experiences.
          </p>
        </div>

        <Stagger className="landing-features-grid" staggerMs={60}>
          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box blue motion-pop-in">
                <VehicleIcon size={24} />
              </div>
              <h3 className="feature-title">Vehicle Management</h3>
              <p className="feature-text">
                Track vehicle status, mileage, insurance expiries, fuel logs, and schedule preventive maintenance seamlessly.
              </p>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box green motion-pop-in">
                <DriverIcon size={24} />
              </div>
              <h3 className="feature-title">Driver Management</h3>
              <p className="feature-text">
                Organize driver licenses, shifts, assignment rosters, performance ratings, and instant dispatch notifications.
              </p>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box orange motion-pop-in">
                <BookingIcon size={24} />
              </div>
              <h3 className="feature-title">Smart Bookings</h3>
              <p className="feature-text">
                Real-time seat reservations, schedule lookups, fare calculation, and dynamic booking confirmation workflows.
              </p>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box indigo motion-pop-in">
                <TripIcon size={24} />
              </div>
              <h3 className="feature-title">Live Trip Tracking</h3>
              <p className="feature-text">
                Real-time GPS telemetry, departure/arrival checkpoints, route alerts, and delay status updates.
              </p>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box purple motion-pop-in">
                <QrIcon size={24} />
              </div>
              <h3 className="feature-title">QR Payments</h3>
              <p className="feature-text">
                Instant boarding pass verification with custom QR codes, receipt generation, and transaction reconciliation.
              </p>
            </Card>
          </TiltCard>

          <TiltCard>
            <Card className="feature-card feature-card-conic">
              <div className="feature-icon-box red motion-pop-in">
                <ReportIcon size={24} />
              </div>
              <h3 className="feature-title">Reports & Analytics</h3>
              <p className="feature-text">
                Comprehensive financial statements, utilization metrics, CSV and PDF exports for administrators and executives.
              </p>
            </Card>
          </TiltCard>
        </Stagger>
      </section>

      {/* Services / Value Proposition Section */}
      <section className="landing-services" id="services">
        <div className="landing-services-card">
          <div className="services-content">
            <span className="services-tag">Built for Operations</span>
            <h2>Why Leading Transport Fleets Choose FleetFlow</h2>
            <div className="services-bullets">
              <div className="service-bullet">
                <div className="bullet-check"><CheckIcon size={16} /></div>
                <div>
                  <strong>Role-Based Access Control</strong>
                  <p>Custom tailored dashboards for Admins, Fleet Managers, Drivers, and Passengers.</p>
                </div>
              </div>
              <div className="service-bullet">
                <div className="bullet-check"><CheckIcon size={16} /></div>
                <div>
                  <strong>Verified Security</strong>
                  <p>Two-factor email OTP validation and administrative driver license approvals.</p>
                </div>
              </div>
              <div className="service-bullet">
                <div className="bullet-check"><CheckIcon size={16} /></div>
                <div>
                  <strong>Instant Boarding Check-in</strong>
                  <p>Drivers scan passenger digital QR tickets in less than 2 seconds with zero paperwork.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="services-action">
            <h3>Ready to optimize your fleet?</h3>
            <p>Join hundreds of modern transportation companies managing trips with FleetFlow.</p>
            <Link to="/register">
              <Button variant="primary" size="large">
                Create Free Account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        ref={footerRef}
        className={`landing-footer ${footerVisible ? 'motion-fade-in' : ''}`}
        id="contact"
      >
        <div className="landing-footer-inner">
          <div className="footer-col-brand">
            <Logo size="medium" />
            <p className="footer-tagline">
              Intelligent transportation management for enterprise fleets and modern commuter services.
            </p>
            <span className="footer-copyright">
              © {new Date().getFullYear()} FleetFlow Technologies Inc. All rights reserved.
            </span>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Platform</h4>
            <a href="#features" className="footer-link">Vehicles</a>
            <a href="#features" className="footer-link">Drivers</a>
            <a href="#features" className="footer-link">Bookings</a>
            <a href="#features" className="footer-link">Live Tracking</a>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Solutions</h4>
            <a href="#services" className="footer-link">Enterprise Transit</a>
            <a href="#services" className="footer-link">Private Coaches</a>
            <a href="#services" className="footer-link">Corporate Shuttles</a>
            <a href="#services" className="footer-link">QR Ticketing</a>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Access</h4>
            <Link to="/login" className="footer-link">Sign In</Link>
            <Link to="/register" className="footer-link">Driver Application</Link>
            <Link to="/register" className="footer-link">Passenger Registration</Link>
            <Link to="/forgot-password" className="footer-link">Account Recovery</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
