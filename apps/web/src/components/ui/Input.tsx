import * as React from 'react';
type Props = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, Props>(({ className='', ...rest }, ref) => (
  <input ref={ref} className={`border rounded-md px-3 py-2 text-sm w-full ${className}`} {...rest} />
));
Input.displayName = 'Input';
