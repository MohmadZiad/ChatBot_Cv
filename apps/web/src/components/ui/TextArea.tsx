import * as React from 'react';
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export const TextArea = React.forwardRef<HTMLTextAreaElement, Props>(({ className='', ...rest }, ref) => (
  <textarea ref={ref} className={`border rounded-md px-3 py-2 text-sm w-full ${className}`} {...rest} />
));
TextArea.displayName = 'TextArea';
