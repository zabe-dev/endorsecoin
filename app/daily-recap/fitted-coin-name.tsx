'use client';

import { useLayoutEffect, useRef } from 'react';

export function FittedCoinName({ name }: { name: string }) {
  const nameRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    const fitName = () => {
      element.style.fontSize = '';
      const availableWidth = element.clientWidth;
      const fullWidth = element.scrollWidth;
      if (fullWidth > availableWidth && availableWidth > 0) {
        const currentSize = Number.parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${Math.max(11, currentSize * (availableWidth / fullWidth))}px`;
      }
    };

    fitName();
    const observer = new ResizeObserver(fitName);
    observer.observe(element);
    return () => observer.disconnect();
  }, [name]);

  return <strong ref={nameRef}>{name}</strong>;
}
