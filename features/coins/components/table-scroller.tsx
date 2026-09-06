'use client';

import { useRef, type ReactNode, type WheelEvent } from 'react';

export function TableScroller({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const scroller = scrollerRef.current;
    if (!scroller || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    if (maxScroll <= 0) return;

    const movingRight = event.deltaY > 0;
    const canMove = movingRight ? scroller.scrollLeft < maxScroll : scroller.scrollLeft > 0;
    if (!canMove) return;

    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  }

  return (
    <div className={`table-frame ${className}`}>
      <div ref={scrollerRef} className="table-wrap" onWheel={handleWheel}>
        {children}
      </div>
    </div>
  );
}
