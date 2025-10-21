import * as React from 'react';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

export const Button: React.FC<Props> = ({ className = '', loading, children, ...rest }) => (
  <button
    className={`inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 ${className}`}
    disabled={loading || rest.disabled} {...rest}
  >
    {loading ? '...' : children}
  </button>
);
