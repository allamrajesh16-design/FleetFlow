import React from 'react';
import './PasswordStrengthMeter.css';

/**
 * Calculates password strength and rules checklist:
 * - min 6 chars
 * - upper and lower case
 * - number
 * - symbol
 */
export function checkPasswordCriteria(password = '') {
  const p = String(password || '');
  const hasMinLength = p.length >= 6;
  const hasLower = /[a-z]/.test(p);
  const hasUpper = /[A-Z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSymbol = /[^a-zA-Z0-9]/.test(p);

  const criteria = [
    { key: 'length', label: 'At least 6 characters', valid: hasMinLength },
    { key: 'case', label: 'Upper and lower case letters', valid: hasLower && hasUpper },
    { key: 'number', label: 'At least one number', valid: hasNumber },
    { key: 'symbol', label: 'At least one symbol (e.g. !@#$%)', valid: hasSymbol },
  ];

  const validCount = criteria.filter((c) => c.valid).length;
  let score = 0; // 0 to 4
  let label = 'Very Weak';

  if (!p) {
    score = 0;
    label = '';
  } else if (validCount === 1) {
    score = 1;
    label = 'Weak';
  } else if (validCount === 2) {
    score = 2;
    label = 'Fair';
  } else if (validCount === 3) {
    score = 3;
    label = 'Good';
  } else if (validCount === 4) {
    score = 4;
    label = 'Strong';
  }

  return { criteria, score, label, isValid: hasMinLength };
}

export default function PasswordStrengthMeter({ password = '' }) {
  const { criteria, score, label } = checkPasswordCriteria(password);

  const getMeterColorClass = () => {
    switch (score) {
      case 1:
        return 'meter-danger';
      case 2:
        return 'meter-warning';
      case 3:
        return 'meter-info';
      case 4:
        return 'meter-success';
      default:
        return '';
    }
  };

  return (
    <div className="password-strength-container" aria-live="polite">
      {password ? (
        <div className="password-strength-bar-wrapper">
          <div className="password-strength-bars">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`password-strength-bar ${step <= score ? getMeterColorClass() : ''}`}
              />
            ))}
          </div>
          <span className={`password-strength-label ${getMeterColorClass()}`}>{label}</span>
        </div>
      ) : null}

      <ul className="password-rules-list">
        {criteria.map((item) => (
          <li
            key={item.key}
            className={`password-rule-item ${item.valid ? 'is-valid' : 'is-pending'}`}
          >
            <span className="password-rule-icon" aria-hidden="true">
              {item.valid ? '✓' : '○'}
            </span>
            <span className="password-rule-text">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

