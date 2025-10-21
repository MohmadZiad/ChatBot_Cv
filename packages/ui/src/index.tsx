import React from 'react';
export const Badge = ({ children }: { children: React.ReactNode }) =>
  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border">{children}</span>;
