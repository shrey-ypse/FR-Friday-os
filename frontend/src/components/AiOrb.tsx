import React from 'react';
import './AiOrb.css';

type OrbState = 'idle' | 'listening' | 'thinking' | 'executing' | 'completed';

interface AiOrbProps {
  state: OrbState;
}

export const AiOrb: React.FC<AiOrbProps> = ({ state }) => {
  return (
    <div className={`orb-container ${state}`}>
      {/* Outer Holographic Orbits */}
      <div className="orbit-ring ring-outer"></div>
      <div className="orbit-ring ring-inner"></div>

      {/* Main Glowing Sphere */}
      <div className="orb-sphere">
        <div className="orb-core"></div>
        <div className="orb-energy-wave wave-1"></div>
        <div className="orb-energy-wave wave-2"></div>
      </div>
      
      {/* Status Text overlay styled like the screenshot */}
      <div className="orb-status-text" style={{ textAlign: 'center', bottom: '-40px' }}>
        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600, letterSpacing: '1px', fontFamily: 'var(--font-display)', marginBottom: '4px' }}>FRIDAY Core</div>
        <div style={{ color: 'var(--color-blue)', fontSize: '11px', fontWeight: 500, opacity: 0.85 }}>
          {state === 'idle' && 'Online • Ready'}
          {state === 'listening' && 'Listening...'}
          {state === 'thinking' && 'Thinking...'}
          {state === 'executing' && 'Executing...'}
          {state === 'completed' && 'Completed'}
        </div>
      </div>
    </div>
  );
};
