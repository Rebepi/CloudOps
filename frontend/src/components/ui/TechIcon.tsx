import React from 'react';

export interface TechIconProps {
  name: string;
  size?: number;
  className?: string;
  showBadge?: boolean;
}

export function TechIcon({ name, size = 20, className = '', showBadge = false }: TechIconProps) {
  const normalized = (name || '').toLowerCase().trim();

  // Helper for rendering SVG with common size & class
  const wrap = (svgContent: React.ReactNode, bgColor?: string) => {
    if (showBadge && bgColor) {
      return (
        <span
          className={`inline-flex items-center justify-center rounded-lg p-1.5 shadow-xs transition-transform hover:scale-105 ${className}`}
          style={{ backgroundColor: bgColor }}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
            {svgContent}
          </svg>
        </span>
      );
    }
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
      >
        {svgContent}
      </svg>
    );
  };

  // 1. Docker
  if (normalized.includes('docker') || normalized.includes('container') || normalized === 'compose') {
    return wrap(
      <g fill="#2496ED">
        <rect x="2" y="10" width="3" height="3" rx="0.5" />
        <rect x="6" y="10" width="3" height="3" rx="0.5" />
        <rect x="10" y="10" width="3" height="3" rx="0.5" />
        <rect x="6" y="6" width="3" height="3" rx="0.5" />
        <rect x="10" y="6" width="3" height="3" rx="0.5" />
        <rect x="14" y="6" width="3" height="3" rx="0.5" />
        <path d="M21.5 12.5C21 11.5 19.5 11 18.5 11.5C18.2 11.3 17.5 11.1 16.5 11.5L16 14H2C2 17.5 5 20 10.5 20C17 20 21 16.5 21.5 12.5Z" />
      </g>,
      'rgba(36, 150, 237, 0.12)'
    );
  }

  // 2. Kubernetes
  if (normalized.includes('k8s') || normalized.includes('kubernetes')) {
    return wrap(
      <g stroke="#326CE5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
        <circle cx="12" cy="12" r="3" fill="#326CE5" />
        <line x1="12" y1="2" x2="12" y2="9" />
        <line x1="21" y1="7" x2="14.5" y2="10.5" />
        <line x1="21" y1="17" x2="14.5" y2="13.5" />
        <line x1="12" y1="22" x2="12" y2="15" />
        <line x1="3" y1="17" x2="9.5" y2="13.5" />
        <line x1="3" y1="7" x2="9.5" y2="10.5" />
      </g>,
      'rgba(50, 108, 229, 0.12)'
    );
  }

  // 3. Terraform
  if (normalized.includes('terraform') || normalized.includes('iac')) {
    return wrap(
      <g fill="#844FBA">
        <polygon points="3 3 8.5 6.2 8.5 12.5 3 9.3" />
        <polygon points="9.5 6.8 15 10 15 16.2 9.5 13" />
        <polygon points="16 10.6 21.5 13.8 21.5 20 16 16.8" />
        <polygon points="9.5 14.2 15 17.4 15 23.6 9.5 20.4" />
      </g>,
      'rgba(132, 79, 186, 0.12)'
    );
  }

  // 4. React
  if (normalized.includes('react')) {
    return wrap(
      <g stroke="#61DAFB" strokeWidth="1.5" fill="none">
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
        <circle cx="12" cy="12" r="1.8" fill="#61DAFB" />
      </g>,
      'rgba(97, 218, 251, 0.12)'
    );
  }

  // 5. Node.js
  if (normalized.includes('node')) {
    return wrap(
      <g fill="#539E43">
        <path d="M12 2L21 7.2V17.8L12 23L3 17.8V7.2L12 2Z" fillOpacity="0.2" stroke="#539E43" strokeWidth="1.5" />
        <path d="M12 6L18 9.5V16.5L12 20L6 16.5V9.5L12 6Z" fill="#539E43" />
      </g>,
      'rgba(83, 158, 67, 0.12)'
    );
  }

  // 6. Python / FastAPI / Django
  if (normalized.includes('python') || normalized.includes('django') || normalized.includes('fastapi')) {
    return wrap(
      <g>
        <path d="M11.9 2C8.5 2 6.5 3.5 6.5 5.5V7H12V8H4.5C2.5 8 1 9.8 1 12.5C1 15.2 2.5 16 4.5 16H6V14.5C6 12.5 7.5 11 9.5 11H14.5C16.5 11 18 9.5 18 7.5C18 5.5 16 2 11.9 2ZM9 4C9.6 4 10 4.4 10 5C10 5.6 9.6 6 9 6C8.4 6 8 5.6 8 5C8 4.4 8.4 4 9 4Z" fill="#3776AB" />
        <path d="M12.1 22C15.5 22 17.5 20.5 17.5 18.5V17H12V16H19.5C21.5 16 23 14.2 23 11.5C23 8.8 21.5 8 19.5 8H18V9.5C18 11.5 16.5 13 14.5 13H9.5C7.5 13 6 14.5 6 16.5C6 18.5 8 22 12.1 22ZM15 20C14.4 20 14 19.6 14 19C14 18.4 14.4 18 15 18C15.6 18 16 18.4 16 19C16 19.6 15.6 20 15 20Z" fill="#FFD43B" />
      </g>,
      'rgba(55, 118, 171, 0.12)'
    );
  }

  // 7. TypeScript
  if (normalized.includes('typescript') || normalized === 'ts' || normalized.includes('.ts')) {
    return wrap(
      <g>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#3178C6" />
        <path d="M6 10H12M9 10V18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 17C14.5 17.6 15.3 18 16.3 18C17.5 18 18.5 17.3 18.5 16.2C18.5 14.8 17 14.3 15.5 13.7C14.2 13.2 14.2 12.3 14.2 11.7C14.2 10.7 15.1 10 16.3 10C17.2 10 17.9 10.4 18.4 11" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      </g>,
      'rgba(49, 120, 198, 0.12)'
    );
  }

  // 8. JavaScript
  if (normalized.includes('javascript') || normalized === 'js' || normalized.includes('.js')) {
    return wrap(
      <g>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#F7DF1E" />
        <path d="M8 13V16.5C8 17.5 7.2 18 6 17.8" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
        <path d="M13 16.8C13.5 17.5 14.5 18 15.5 18C17 18 18 17.2 18 16C18 14.5 16.5 14 15 13.5C13.8 13 13.8 12.2 13.8 11.5C13.8 10.6 14.6 10 15.6 10C16.5 10 17.2 10.5 17.6 11.2" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
      </g>,
      'rgba(247, 223, 30, 0.12)'
    );
  }

  // 9. PostgreSQL
  if (normalized.includes('postgres') || normalized.includes('psql')) {
    return wrap(
      <g fill="#4169E1">
        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM17.2 16.5C16.1 17.8 14.2 18.5 12 18.5C8.8 18.5 6.5 16.2 6.5 13C6.5 9.8 8.8 7.5 12 7.5C14.2 7.5 16.1 8.2 17.2 9.5L15.4 11C14.7 10.1 13.5 9.5 12 9.5C10 9.5 8.5 11 8.5 13C8.5 15 10 16.5 12 16.5C13.5 16.5 14.7 15.9 15.4 15L17.2 16.5Z" />
      </g>,
      'rgba(65, 105, 225, 0.12)'
    );
  }

  // 10. MongoDB
  if (normalized.includes('mongo')) {
    return wrap(
      <g fill="#47A248">
        <path d="M12 2C12 2 6 7 6 13C6 17 8.5 20.5 12 22C15.5 20.5 18 17 18 13C18 7 12 2 12 2ZM12 20.5C11.5 20.5 11.3 19 11.3 17.5C11.3 14.5 12 11.5 12 11.5C12 11.5 12.7 14.5 12.7 17.5C12.7 19 12.5 20.5 12 20.5Z" />
      </g>,
      'rgba(71, 162, 72, 0.12)'
    );
  }

  // 11. Redis
  if (normalized.includes('redis') || normalized.includes('cache')) {
    return wrap(
      <g fill="#DC382D">
        <polygon points="12 2 21 7 12 12 3 7" />
        <polygon points="3 8.5 12 13.5 12 18 3 13" fillOpacity="0.8" />
        <polygon points="21 8.5 12 13.5 12 18 21 13" fillOpacity="0.6" />
        <polygon points="3 14.5 12 19.5 12 22 3 17" fillOpacity="0.8" />
        <polygon points="21 14.5 12 19.5 12 22 21 17" fillOpacity="0.6" />
      </g>,
      'rgba(220, 56, 45, 0.12)'
    );
  }

  // 12. Nginx
  if (normalized.includes('nginx')) {
    return wrap(
      <g fill="#009639">
        <polygon points="12 2 21 7.2 21 16.8 12 22 3 16.8 3 7.2" fillOpacity="0.15" stroke="#009639" strokeWidth="1.5" />
        <path d="M7 8V16L17 8V16" stroke="#009639" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>,
      'rgba(0, 150, 57, 0.12)'
    );
  }

  // 13. AWS S3
  if (normalized.includes('s3') || normalized.includes('bucket') || normalized.includes('storage')) {
    return wrap(
      <g>
        <ellipse cx="12" cy="6" rx="8" ry="3" fill="#10B981" />
        <path d="M4 6V18C4 19.66 7.58 21 12 21C16.42 21 20 19.66 20 18V6" stroke="#10B981" strokeWidth="2" fill="none" />
        <path d="M4 12C4 13.66 7.58 15 12 15C16.42 15 20 13.66 20 12" stroke="#10B981" strokeWidth="1.5" fill="none" />
      </g>,
      'rgba(16, 185, 129, 0.12)'
    );
  }

  // 14. AWS IAM / Security / Auth
  if (normalized.includes('iam') || normalized.includes('identity') || normalized.includes('auth') || normalized.includes('token')) {
    return wrap(
      <g stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="#6366F1" fillOpacity="0.15" />
        <circle cx="12" cy="16" r="1.5" fill="#6366F1" />
        <path d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V11" />
      </g>,
      'rgba(99, 102, 241, 0.12)'
    );
  }

  // 15. AWS RDS / Database
  if (normalized.includes('rds') || normalized.includes('database') || normalized.includes('aurora')) {
    return wrap(
      <g stroke="#3B82F6" strokeWidth="1.8" fill="none">
        <ellipse cx="12" cy="5" rx="8" ry="2.5" fill="#3B82F6" fillOpacity="0.2" />
        <path d="M4 5V11C4 12.38 7.58 13.5 12 13.5C16.42 13.5 20 12.38 20 11V5" />
        <path d="M4 11V17C4 18.38 7.58 19.5 12 19.5C16.42 19.5 20 18.38 20 17V11" />
      </g>,
      'rgba(59, 130, 246, 0.12)'
    );
  }

  // 16. AWS Lambda / Serverless
  if (normalized.includes('lambda') || normalized.includes('serverless')) {
    return wrap(
      <g stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="5" y1="20" x2="11" y2="6" />
        <line x1="10" y1="12" x2="19" y2="20" />
        <line x1="17" y1="20" x2="20" y2="20" />
      </g>,
      'rgba(249, 115, 22, 0.12)'
    );
  }

  // 17. AWS EC2 / Compute
  if (normalized.includes('ec2') || normalized.includes('compute') || normalized.includes('instance')) {
    return wrap(
      <g stroke="#EA580C" strokeWidth="1.8" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2" fill="#EA580C" fillOpacity="0.15" />
        <rect x="8" y="8" width="8" height="8" rx="1" fill="#EA580C" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="14" y1="20" x2="14" y2="23" />
      </g>,
      'rgba(234, 88, 12, 0.12)'
    );
  }

  // 18. AWS CloudWatch / Observability / Telemetry
  if (normalized.includes('cloudwatch') || normalized.includes('telemetry') || normalized.includes('metric')) {
    return wrap(
      <g stroke="#D946EF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="12" cy="12" r="9" fill="#D946EF" fillOpacity="0.1" />
        <polyline points="4 14 8 10 12 14 16 8 20 12" />
      </g>,
      'rgba(217, 70, 239, 0.12)'
    );
  }

  // 19. AWS CloudTrail / Audit
  if (normalized.includes('cloudtrail') || normalized.includes('audit') || normalized.includes('log')) {
    return wrap(
      <g stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14 2H6C4.89 2 4 2.89 4 4V20C4 21.11 4.89 22 6 22H18C19.11 22 20 21.11 20 20V8L14 2Z" fill="#F59E0B" fillOpacity="0.15" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </g>,
      'rgba(245, 158, 11, 0.12)'
    );
  }

  // 20. AWS VPC / Network
  if (normalized.includes('vpc') || normalized.includes('network')) {
    return wrap(
      <g stroke="#A855F7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" strokeDasharray="3 3" />
        <circle cx="7" cy="8" r="2.5" fill="#A855F7" />
        <circle cx="17" cy="8" r="2.5" fill="#A855F7" />
        <circle cx="12" cy="16" r="2.5" fill="#A855F7" />
        <line x1="8.5" y1="9.5" x2="10.5" y2="14.5" />
        <line x1="15.5" y1="9.5" x2="13.5" y2="14.5" />
      </g>,
      'rgba(168, 85, 247, 0.12)'
    );
  }

  // 21. Security Hub / Inspector / Shield
  if (normalized.includes('security') || normalized.includes('hub') || normalized.includes('inspector')) {
    return wrap(
      <g stroke="#F43F5E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M12 2L3 6V11C3 16.52 6.84 21.74 12 23C17.16 21.74 21 16.52 21 11V6L12 2Z" fill="#F43F5E" fillOpacity="0.15" />
        <polyline points="9 12 11 14 15 10" stroke="#F43F5E" strokeWidth="2" />
      </g>,
      'rgba(244, 63, 94, 0.12)'
    );
  }

  // Default Fallback
  return wrap(
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <polyline points="21 15 16 10 5 21" />
    </g>,
    'rgba(148, 163, 184, 0.12)'
  );
}
