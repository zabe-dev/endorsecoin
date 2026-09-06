import { ImageResponse } from 'next/og';
import { homeTitle } from '@/lib/seo/metadata';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: '#050807',
        color: '#f4f7f2',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            background: '#bbff3f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#11150f',
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          E
        </div>
        <div style={{ fontSize: 34, fontWeight: 700 }}>EndorseCoin</div>
      </div>
      <div style={{ maxWidth: 920 }}>
        <div
          style={{
            color: '#bbff3f',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginBottom: 22,
          }}
        >
          Community discovery
        </div>
        <div style={{ fontSize: 70, lineHeight: 1.05, fontWeight: 800 }}>{homeTitle}</div>
      </div>
      <div style={{ color: '#9ba39a', fontSize: 26 }}>endorsecoin.com</div>
    </div>,
    size,
  );
}
