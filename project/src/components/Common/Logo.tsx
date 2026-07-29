import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = '' }) => {
  return (
    <img
      src="/assets/logo.png"
      alt="TeachFlow"
      draggable={false}
      className={`
        block
        w-48
        h-auto
        object-cover
        object-left
        max-h-[150%]
        -mr-11
        translate-y-2
        ${className}
      `.trim()}
      style={{
        clipPath: 'inset(0 15% 0 0)',
      }}
    />
  );
};

export default Logo;
