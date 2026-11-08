import Image from 'next/image';
import logo from '../public/amona-logo.png';

export default function AmonaLogo({ decorative = false }: { decorative?: boolean }) {
  return <Image className="amona-logo" src={logo} alt={decorative ? '' : 'Amona'} sizes="220px" />;
}
