import Image from 'next/image';
import Link from 'next/link';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="EndorseCoin home">
      <span className="brand-mark">
        <Image src="/logo.svg" alt="EndorseCoin logo" width={40} height={40} />
      </span>
      <span className="brand-name">endorsecoin</span>
    </Link>
  );
}
