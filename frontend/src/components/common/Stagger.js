import React from 'react';
import { isMotionDisabled } from '../../hooks/useMotion';

/**
 * Stagger
 * Wraps list or grid children so they reveal in sequence 40ms apart.
 * Animates a maximum of 12 children; children 13+ appear instantly.
 */
export default function Stagger({
  children,
  className = '',
  itemClassName = 'motion-fade-rise',
  staggerMs = 40,
  maxAnimated = 12,
  as: Component = 'div',
  ...props
}) {
  const disabled = isMotionDisabled();

  const childArray = React.Children.toArray(children);

  return (
    <Component className={`motion-stagger-container ${className}`} {...props}>
      {childArray.map((child, index) => {
        if (!React.isValidElement(child)) return child;

        if (disabled || index >= maxAnimated) {
          return child;
        }

        const delay = index * staggerMs;
        const combinedStyle = {
          ...child.props.style,
          animationDelay: `${delay}ms`,
        };

        const combinedClassName = [
          child.props.className || '',
          itemClassName,
        ].filter(Boolean).join(' ');

        return React.cloneElement(child, {
          style: combinedStyle,
          className: combinedClassName,
        });
      })}
    </Component>
  );
}
